// ============================================================================
// Song Battle — local sync server (zero npm dependencies)
//
// Implements the WebSocket protocol directly on top of Node's built-in http
// module, so there's nothing to `npm install` — this avoids the npm
// ERR_INVALID_ARG_TYPE bug some machines hit with corrupted/misconfigured
// npm installs. Browsers can't tell the difference; the wire protocol is
// identical either way.
//
// Run:  node server.js
// Then open http://<your-computer's-LAN-IP>:3000 on every device on the
// same WiFi network.
// ============================================================================
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;
const CERT_PATH = path.join(PUBLIC_DIR, "cert.pem");
const KEY_PATH = path.join(PUBLIC_DIR, "key.pem");
const hasCert = fs.existsSync(CERT_PATH) && fs.existsSync(KEY_PATH);
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || "";

// ============================================================================
// YouTube search — server-side so the API key never reaches the browser.
// ============================================================================
function searchYouTube(query, callback) {
  if (!YOUTUBE_API_KEY) { callback(new Error("Server has no YOUTUBE_API_KEY configured"), null); return; }
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoCategoryId: "10", // Music category
    maxResults: "8",
    q: query,
    key: YOUTUBE_API_KEY,
  });
  const url = `https://www.googleapis.com/youtube/v3/search?${params.toString()}`;
  https.get(url, (res) => {
    let data = "";
    res.on("data", (chunk) => { data += chunk; });
    res.on("end", () => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.error) { callback(new Error(parsed.error.message || "YouTube API error"), null); return; }
        const results = (parsed.items || [])
          .filter((item) => item.id && item.id.videoId)
          .map((item) => ({
            videoId: item.id.videoId,
            title: item.snippet.title,
            channelTitle: item.snippet.channelTitle,
            thumbnail: (item.snippet.thumbnails && item.snippet.thumbnails.default) ? item.snippet.thumbnails.default.url : "",
          }));
        callback(null, results);
      } catch (e) {
        callback(e, null);
      }
    });
  }).on("error", (e) => callback(e, null));
}

// --- tweak gameplay here — mirrors the CONFIG block in index.html ---------
const CONFIG = {
  ROUND_SECONDS: 120,
  SUDDEN_DEATH_SECONDS: 45,
  VOTE_SECONDS: 30,
  INTRO_DELAY_MS: 2500,
  AUTO_ADVANCE_DELAY_MS: 1400,
  DEFAULT_ROUNDS: 5,
};

function emptySong(source) {
  return { title: "", artist: "", startAt: 0, source };
}

function initialState() {
  return {
    phase: "setup",
    teams: [{ name: "Team Vinyl", score: 0 }, { name: "Team Static", score: 0 }],
    totalRounds: CONFIG.DEFAULT_ROUNDS,
    defaultSource: "spotify",
    round: 1,
    activeTeam: 0,
    turnOrderCount: 0, // increments every round; parity decides who starts (zig-zag)
    isSuddenDeath: false,
    captainSong: [emptySong("spotify"), emptySong("spotify")],
    locked: [false, false],
    revealed: [false, false],
    songDone: [false, false],
    secondsLeft: CONFIG.ROUND_SECONDS,
    playing: false,
    winnerVotes: [0, 0],
    ratings: [[], []],
    voterCount: 0,
    votingSecondsLeft: CONFIG.VOTE_SECONDS,
    roundWinner: null,
    wonByTiebreak: false,
    history: [],
  };
}

let state = initialState();
const timers = { intro: null, prep: null, play: null, vote: null };

function clearAllTimers() {
  clearTimeout(timers.intro);
  clearTimeout(timers.prep);
  clearInterval(timers.play);
  clearInterval(timers.vote);
  timers.intro = timers.prep = timers.play = timers.vote = null;
}

function avg(arr) {
  const nz = arr.filter((x) => x > 0);
  if (!nz.length) return 0;
  return +(nz.reduce((a, b) => a + b, 0) / nz.length).toFixed(1);
}

function turnSeconds() {
  return state.isSuddenDeath ? CONFIG.SUDDEN_DEATH_SECONDS : CONFIG.ROUND_SECONDS;
}

function beginPrep(suddenDeath) {
  clearTimeout(timers.intro);
  clearTimeout(timers.prep);
  state.isSuddenDeath = suddenDeath;
  state.captainSong = [emptySong(state.defaultSource), emptySong(state.defaultSource)];
  state.locked = [false, false];
  state.revealed = [false, false];
  state.songDone = [false, false];
  state.turnOrderCount += 1;
  state.activeTeam = state.turnOrderCount % 2 === 1 ? 0 : 1; // zig-zag: alternate who goes first each round
  state.phase = "intro";
  timers.intro = setTimeout(() => {
    state.phase = "prep";
    broadcast();
  }, CONFIG.INTRO_DELAY_MS);
}

function schedulePrepAdvanceIfReady() {
  if (state.phase === "prep" && state.locked[0] && state.locked[1]) {
    clearTimeout(timers.prep);
    timers.prep = setTimeout(() => {
      state.phase = "turn";
      broadcast();
    }, CONFIG.AUTO_ADVANCE_DELAY_MS);
  }
}

function startPlayTimer() {
  clearInterval(timers.play);
  timers.play = setInterval(() => {
    if (!state.playing) return;
    state.secondsLeft -= 1;
    if (state.secondsLeft <= 0) {
      state.secondsLeft = 0;
      state.playing = false;
      state.songDone[state.activeTeam] = true;
      clearInterval(timers.play);
    }
    broadcast();
  }, 1000);
}

function startVoteTimer() {
  clearInterval(timers.vote);
  timers.vote = setInterval(() => {
    state.votingSecondsLeft -= 1;
    if (state.votingSecondsLeft <= 0) {
      clearInterval(timers.vote);
      revealResults();
    }
    broadcast();
  }, 1000);
}

function revealResults() {
  let winner, byTiebreak = false;
  const [v0, v1] = state.winnerVotes;
  if (v0 !== v1) {
    winner = v0 > v1 ? 0 : 1;
  } else {
    const a0 = avg(state.ratings[0]), a1 = avg(state.ratings[1]);
    if (a0 !== a1) { winner = a0 > a1 ? 0 : 1; byTiebreak = true; }
    else winner = null;
  }
  state.roundWinner = winner;
  state.wonByTiebreak = byTiebreak;
  if (winner !== null) state.teams[winner].score += 1;
  state.history.push({
    round: state.round, isSuddenDeath: state.isSuddenDeath, songs: [...state.captainSong],
    winnerVotes: [...state.winnerVotes], winner, byTiebreak,
  });
  state.phase = "results";
}

function nextRound() {
  if (state.isSuddenDeath) {
    if (state.teams[0].score !== state.teams[1].score) { state.phase = "final"; return; }
    beginPrep(true);
    return;
  }
  if (state.round >= state.totalRounds) {
    if (state.teams[0].score === state.teams[1].score) { beginPrep(true); return; }
    state.phase = "final";
    return;
  }
  state.round += 1;
  beginPrep(false);
}

function handleAction(action) {
  switch (action.type) {
    case "SET_TEAM_NAME":
      if (state.phase === "setup") state.teams[action.team].name = action.name;
      break;
    case "SET_TOTAL_ROUNDS":
      if (state.phase === "setup") state.totalRounds = action.n;
      break;
    case "SET_DEFAULT_SOURCE":
      if (state.phase === "setup") state.defaultSource = action.source;
      break;
    case "START_GAME":
      state.round = 1;
      beginPrep(false);
      break;
    case "LOCK_IN": {
      const { team, song } = action;
      if (!song || !song.title || !song.title.trim()) break;
      if (state.locked[team]) break;
      state.captainSong[team] = song;
      state.locked[team] = true;
      schedulePrepAdvanceIfReady();
      break;
    }
    case "REVEAL_AND_PLAY": {
      const team = state.activeTeam;
      if (state.revealed[team]) break;
      state.revealed[team] = true;
      state.secondsLeft = turnSeconds();
      state.playing = true;
      startPlayTimer();
      break;
    }
    case "STOP_SONG":
      state.playing = false;
      state.songDone[state.activeTeam] = true;
      clearInterval(timers.play);
      break;
    case "NEXT_TURN": {
      const otherTeam = 1 - state.activeTeam;
      if (!state.songDone[otherTeam]) {
        state.activeTeam = otherTeam;
        state.secondsLeft = turnSeconds();
        state.playing = false;
      } else {
        state.winnerVotes = [0, 0];
        state.ratings = [[], []];
        state.voterCount = 0;
        state.votingSecondsLeft = CONFIG.VOTE_SECONDS;
        state.phase = "voting";
        startVoteTimer();
      }
      break;
    }
    case "CAST_VOTE": {
      const { pick, r0, r1 } = action;
      if (pick !== 0 && pick !== 1) break;
      state.winnerVotes[pick] += 1;
      state.ratings[0].push(r0 || 0);
      state.ratings[1].push(r1 || 0);
      state.voterCount += 1;
      break;
    }
    case "CLOSE_VOTING":
      clearInterval(timers.vote);
      revealResults();
      break;
    case "NEXT_ROUND":
      nextRound();
      break;
    case "PLAY_AGAIN": {
      const names = [state.teams[0].name, state.teams[1].name];
      clearAllTimers();
      state = initialState();
      state.teams[0].name = names[0];
      state.teams[1].name = names[1];
      break;
    }
    default:
      console.warn("unknown action", action.type);
  }
  broadcast();
}

// ============================================================================
// Minimal WebSocket implementation (RFC 6455) — no external package needed.
// ============================================================================
const WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const clients = new Set();

function acceptKeyFor(key) {
  return crypto.createHash("sha1").update(key + WS_MAGIC).digest("base64");
}

function encodeFrame(payloadBuffer, opcode = 0x1) {
  const len = payloadBuffer.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  return Buffer.concat([header, payloadBuffer]);
}

// parses as many complete frames as are available in `buffer`;
// returns the parsed messages plus any leftover partial bytes to keep buffering
function decodeFrames(buffer) {
  const messages = [];
  let offset = 0;
  while (true) {
    if (buffer.length - offset < 2) break;
    const b0 = buffer[offset], b1 = buffer[offset + 1];
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let pos = offset + 2;
    if (len === 126) {
      if (buffer.length - pos < 2) break;
      len = buffer.readUInt16BE(pos); pos += 2;
    } else if (len === 127) {
      if (buffer.length - pos < 8) break;
      len = buffer.readUInt32BE(pos + 4); pos += 8; // assumes payload < 4GB, plenty for this app
    }
    let maskKey;
    if (masked) {
      if (buffer.length - pos < 4) break;
      maskKey = buffer.slice(pos, pos + 4); pos += 4;
    }
    if (buffer.length - pos < len) break; // incomplete frame — wait for more data
    let payload = buffer.slice(pos, pos + len);
    if (masked) {
      const unmasked = Buffer.alloc(len);
      for (let i = 0; i < len; i++) unmasked[i] = payload[i] ^ maskKey[i % 4];
      payload = unmasked;
    }
    pos += len;
    messages.push({ opcode, payload });
    offset = pos;
  }
  return { messages, rest: buffer.slice(offset) };
}

function broadcast() {
  const payload = Buffer.from(JSON.stringify({ type: "STATE", state }), "utf8");
  const frame = encodeFrame(payload, 0x1);
  for (const socket of clients) {
    if (!socket.destroyed) socket.write(frame);
  }
}

// ---- static file server ----------------------------------------------------
const MIME = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css" };
const requestHandler = (req, res) => {
  if (req.url === "/favicon.ico") { res.writeHead(204); res.end(); return; } // avoid a noisy 404 for the browser's automatic favicon request
  let filePath = req.url === "/" ? "/index.html" : req.url;
  filePath = path.join(PUBLIC_DIR, filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "text/plain" });
    res.end(data);
  });
};

const server = hasCert
  ? https.createServer({ cert: fs.readFileSync(CERT_PATH), key: fs.readFileSync(KEY_PATH) }, requestHandler)
  : http.createServer(requestHandler);

// ---- websocket upgrade handling, same http server + port ------------------
server.on("upgrade", (req, socket, head) => {
  const key = req.headers["sec-websocket-key"];
  if (!key) { socket.destroy(); return; }
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${acceptKeyFor(key)}\r\n\r\n`
  );
  socket.setNoDelay(true);
  clients.add(socket);

  let buffer = head && head.length ? Buffer.from(head) : Buffer.alloc(0);

  socket.write(encodeFrame(Buffer.from(JSON.stringify({ type: "STATE", state }), "utf8")));

  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    const { messages, rest } = decodeFrames(buffer);
    buffer = rest;
    for (const msg of messages) {
      if (msg.opcode === 0x8) { socket.end(); clients.delete(socket); return; }
      if (msg.opcode === 0x9) { socket.write(encodeFrame(msg.payload, 0xA)); continue; } // ping -> pong
      if (msg.opcode === 0x1) {
        try {
          const parsed = JSON.parse(msg.payload.toString("utf8"));
          if (parsed.type === "ACTION" && parsed.action && parsed.action.type === "SEARCH_SONG") {
            const { query, requestId } = parsed.action;
            searchYouTube(query, (err, results) => {
              const reply = JSON.stringify({
                type: "SEARCH_RESULTS",
                requestId,
                results: err ? [] : results,
                error: err ? err.message : null,
              });
              if (!socket.destroyed) socket.write(encodeFrame(Buffer.from(reply, "utf8")));
            });
          } else if (parsed.type === "ACTION") {
            handleAction(parsed.action);
          }
        } catch (e) {
          console.error("Bad message from client:", e.message);
        }
      }
    }
  });

  socket.on("close", () => clients.delete(socket));
  socket.on("error", () => clients.delete(socket));
});

server.listen(PORT, () => {
  const scheme = hasCert ? "https" : "http";
  console.log(`\nSong Battle server running (${hasCert ? "HTTPS — cert.pem/key.pem found" : "HTTP — no cert.pem/key.pem found"}).`);
  console.log(`On this computer:  ${scheme}://localhost:${PORT}`);
  console.log(`On other devices:  ${scheme}://<this-computer's-LAN-IP>:${PORT}`);
  if (!hasCert) {
    console.log(`\nNote: real music SDKs (Spotify/Apple Music) generally require HTTPS.`);
    console.log(`See README.md for how to generate a local cert.pem/key.pem to enable it.\n`);
  } else {
    console.log(`\nFirst visit on each device: your browser will warn that the certificate`);
    console.log(`isn't from a trusted authority (it's self-signed, just for local testing).`);
    console.log(`Choose "Advanced" / "Visit anyway" to proceed — this is expected.\n`);
  }
  if (!YOUTUBE_API_KEY) {
    console.log(`Warning: YOUTUBE_API_KEY is not set — song search will return an error.`);
    console.log(`Set it as an environment variable (see README.md).\n`);
  }
});

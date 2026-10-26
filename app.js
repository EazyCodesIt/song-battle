
"use strict";
const { useState, useEffect, useRef } = React;
// ============================================================================
// CLIENT-SIDE DISPLAY CONFIG — purely for rendering choices/labels/presets.
// The server (server.js) holds the matching CONFIG that actually governs
// timers and rules. Keep the two in sync if you change timing values.
// ============================================================================
const CONFIG = {
    VOTE_URGENT_THRESHOLD: 10,
    ROUND_OPTIONS: [3, 5, 7, 9],
    START_PRESETS: [0, 15, 30, 45, 60, 90],
    ROUND_SECONDS: 120,
    SUDDEN_DEATH_SECONDS: 45,
    PLATFORMS: [
        { key: "spotify", label: "Spotify", tint: "#2EE6A6" },
        { key: "youtube", label: "YouTube", tint: "#FF5C5C" },
        { key: "apple", label: "Apple Music", tint: "#FC3C44" },
    ],
};
const TEAM_COLORS = {
    0: { main: "#FF3D6E", dim: "#4A1226", glow: "rgba(255,61,110,0.45)" },
    1: { main: "#3DD6F5", dim: "#0F3A44", glow: "rgba(61,214,245,0.45)" },
};
function makeIcon(glyph) {
    return function IconGlyph({ size = 16, color, className = "", style = {} }) {
        return React.createElement("span", { className: className, style: { fontSize: size, lineHeight: 1, display: "inline-block", color, ...style } }, glyph);
    };
}
const Play = makeIcon("▶");
const Square = makeIcon("■");
const Trophy = makeIcon("🏆");
const Radio = makeIcon("●");
const Users = makeIcon("👥");
const ChevronRight = makeIcon("→");
const Lock = makeIcon("🔒");
const EyeOff = makeIcon("🙈");
const SkipForward = makeIcon("⏭");
const RotateCcw = makeIcon("↺");
const Tv = makeIcon("📺");
const Sparkles = makeIcon("✨");
const Target = makeIcon("🎯");
const Music2 = makeIcon("♫");
const Music4 = makeIcon("♪");
const Youtube = makeIcon("▶");
const Flame = makeIcon("🔥");
const AlertTriangle = makeIcon("⚠");
const Search = makeIcon("🔍");
const PLATFORM_ICON = { spotify: Music2, youtube: Youtube, apple: Music4 };
function fmt(s) {
    const v = Math.max(0, Math.round(s || 0));
    const m = Math.floor(v / 60);
    const sec = v % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
}
function parseTimeStr(str) {
    if (!str)
        return 0;
    if (str.includes(":")) {
        const [m, s] = str.split(":").map(Number);
        return (!isNaN(m) && !isNaN(s)) ? m * 60 + s : 0;
    }
    const n = Number(str);
    return isNaN(n) ? 0 : n;
}
function platformInfo(key) { return CONFIG.PLATFORMS.find((p) => p.key === key) || CONFIG.PLATFORMS[0]; }
function emptySong(source) { return { title: "", artist: "", startAt: 0, source, videoId: null }; }
function avg(arr) {
    const nz = (arr || []).filter((x) => x > 0);
    if (!nz.length)
        return 0;
    return (nz.reduce((a, b) => a + b, 0) / nz.length).toFixed(1);
}
function StarPicker({ value, onChange, color }) {
    return (React.createElement("div", { className: "flex gap-1" }, [1, 2, 3, 4, 5].map((n) => (React.createElement("button", { key: n, onClick: () => onChange(n), className: "transition-transform active:scale-90", style: { lineHeight: 0 } },
        React.createElement("span", { style: { fontSize: 26, color: n <= value ? color : "#4A4560" } }, n <= value ? "★" : "☆"))))));
}
function TimerRing({ pct, color, size = 220 }) {
    const r = (size - 18) / 2;
    const c = 2 * Math.PI * r;
    return (React.createElement("svg", { width: size, height: size, style: { transform: "rotate(-90deg)" } },
        React.createElement("circle", { cx: size / 2, cy: size / 2, r: r, stroke: "#2A2640", strokeWidth: 14, fill: "none" }),
        React.createElement("circle", { cx: size / 2, cy: size / 2, r: r, stroke: color, strokeWidth: 14, fill: "none", strokeLinecap: "round", strokeDasharray: c, strokeDashoffset: c * (1 - pct), style: { transition: "stroke-dashoffset 1s linear, stroke 0.3s" } })));
}
function MysteryCard({ color, size = 150 }) {
    return (React.createElement("div", { className: "flex items-center justify-center rounded-2xl", style: { width: size, height: size * 1.3, border: `2px dashed ${color}`, background: "repeating-linear-gradient(135deg, #1E1B2E, #1E1B2E 10px, #221F35 10px, #221F35 20px)" } },
        React.createElement("span", { className: "disp text-5xl animate-pulse", style: { color } }, "?")));
}
function SourceBadge({ source }) {
    const info = platformInfo(source);
    const Icon = PLATFORM_ICON[info.key] || Music2;
    return (React.createElement("span", { className: "inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full", style: { background: "#1E1B2E", color: info.tint, border: `1px solid ${info.tint}55` } },
        React.createElement(Icon, { size: 10 }),
        " ",
        info.label));
}
function PlatformPicker({ value, onChange }) {
    return (React.createElement("div", { className: "flex flex-col items-center gap-1.5" },
        React.createElement("div", { className: "flex gap-2 flex-wrap justify-center" }, CONFIG.PLATFORMS.map((p) => {
            const Icon = PLATFORM_ICON[p.key];
            return (React.createElement("button", { key: p.key, onClick: () => onChange(p.key), className: "glowbtn flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold", style: { background: value === p.key ? p.tint : "#1E1B2E", color: value === p.key ? "#100E1A" : "#9C96B8", border: `1px solid ${p.tint}66` } },
                React.createElement(Icon, { size: 13 }),
                " ",
                p.label));
        })),
        value === "youtube" && (React.createElement("p", { className: "text-[10px] flex items-center gap-1 text-center", style: { color: "#FFB84D" } },
            React.createElement(AlertTriangle, { size: 11 }),
            " May play ads mid-song without YouTube Premium"))));
}
// ============================================================================
// Real YouTube search box — replaces manual title/artist typing when the
// captain's chosen source is YouTube. Debounces requests over the existing
// WebSocket connection and shows real, pickable results.
// ============================================================================
function YouTubeSearchBox({ dispatch, onPick, teamColor }) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [err, setErr] = useState(null);
    const debounceRef = useRef(null);
    const reqIdRef = useRef(0);
    useEffect(() => {
        function handler(e) {
            const msg = e.detail;
            if (msg.requestId !== reqIdRef.current)
                return; // stale response, ignore
            setSearching(false);
            setErr(msg.error || null);
            setResults(msg.results || []);
        }
        window.addEventListener("song-battle-search-results", handler);
        return () => window.removeEventListener("song-battle-search-results", handler);
    }, []);
    useEffect(() => {
        clearTimeout(debounceRef.current);
        if (!query.trim()) {
            setResults([]);
            setSearching(false);
            return;
        }
        setSearching(true);
        debounceRef.current = setTimeout(() => {
            reqIdRef.current += 1;
            dispatch({ type: "SEARCH_SONG", query: query.trim(), requestId: reqIdRef.current });
        }, 450);
        return () => clearTimeout(debounceRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query]);
    return (React.createElement("div", { className: "flex flex-col gap-2" },
        React.createElement("div", { className: "flex items-center gap-2 px-3 py-2 rounded-lg", style: { background: "#1E1B2E", border: `1px solid ${teamColor}55` } },
            React.createElement(Search, { size: 14, color: "#9C96B8" }),
            React.createElement("input", { value: query, onChange: (e) => setQuery(e.target.value), placeholder: "Search YouTube for a song\u2026", className: "flex-1 bg-transparent outline-none text-sm", style: { color: "#F5F3FF", background: "transparent" } })),
        searching && React.createElement("p", { className: "text-[10px] text-center", style: { color: "#635D80" } }, "Searching\u2026"),
        err && React.createElement("p", { className: "text-[10px] text-center", style: { color: "#FF3D6E" } }, err),
        results.length > 0 && (React.createElement("div", { className: "flex flex-col gap-1.5", style: { maxHeight: 220, overflowY: "auto" } }, results.map((r) => (React.createElement("button", { key: r.videoId, onClick: () => onPick(r), className: "glowbtn flex items-center gap-2 p-1.5 rounded-lg text-left", style: { background: "#1E1B2E", border: "1px solid #2A2640" } },
            r.thumbnail && React.createElement("img", { src: r.thumbnail, alt: "", style: { width: 44, height: 44, borderRadius: 6, objectFit: "cover", flexShrink: 0 } }),
            React.createElement("div", { style: { minWidth: 0 } },
                React.createElement("p", { className: "text-xs font-bold", style: { color: "#F5F3FF", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, r.title),
                React.createElement("p", { className: "text-[10px]", style: { color: "#9C96B8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, r.channelTitle)))))))));
}
// ============================================================================
// Real YouTube playback via the IFrame Player API — host device only.
//
// The React-owned wrapper <div> is always mounted and never display:none.
// The YouTube API *replaces* whatever element it's handed with an <iframe>,
// so we give it a plain child <div> created here, outside React's control.
// That keeps React's wrapper (and its show/hide styling) in charge of the
// video, rather than styling a detached node that's no longer on the page.
// Playback waits for the player's onReady event, so a host that loads the
// page mid-song still picks up the music.
// ============================================================================
function useYouTubeHostPlayer({ isHost, phase, activeTeam, revealed, playing, captainSong }) {
    const wrapperRef = useRef(null);
    const playerRef = useRef(null);
    const loadedKeyRef = useRef(null);
    const [apiReady, setApiReady] = useState(!!(window.YT && window.YT.Player));
    const [playerReady, setPlayerReady] = useState(false);

    // load the IFrame API script once, only on the host device
    useEffect(() => {
        if (!isHost || apiReady) return;
        if (window.YT && window.YT.Player) { setApiReady(true); return; }
        const prev = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => { setApiReady(true); if (prev) prev(); };
        if (!document.getElementById("youtube-iframe-api")) {
            const tag = document.createElement("script");
            tag.id = "youtube-iframe-api";
            tag.src = "https://www.youtube.com/iframe_api";
            document.head.appendChild(tag);
        }
    }, [isHost, apiReady]);

    // create the player once the API is ready
    useEffect(() => {
        if (!isHost || !apiReady || !wrapperRef.current || playerRef.current) return;
        const target = document.createElement("div");
        wrapperRef.current.appendChild(target);
        playerRef.current = new window.YT.Player(target, {
            width: "100%",
            height: "100%",
            playerVars: { playsinline: 1, controls: 1, rel: 0 },
            events: { onReady: () => setPlayerReady(true) },
        });
    }, [isHost, apiReady]);

    const song = captainSong[activeTeam];
    const videoId = song && song.source === "youtube" ? song.videoId : null;
    const startAt = (song && song.startAt) || 0;
    const shouldPlay = phase === "turn" && revealed[activeTeam] && !!videoId && playing;

    // drive playback from the shared game state
    useEffect(() => {
        const p = playerRef.current;
        if (!isHost || !playerReady || !p) return;
        if (shouldPlay) {
            const key = `${activeTeam}:${videoId}:${startAt}`;
            if (loadedKeyRef.current !== key) {
                loadedKeyRef.current = key;
                p.loadVideoById({ videoId, startSeconds: startAt }); // starts playing on load
            } else {
                p.playVideo();
            }
        } else {
            try { p.pauseVideo(); } catch (e) { }
            if (phase !== "turn") loadedKeyRef.current = null;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isHost, playerReady, shouldPlay, videoId, activeTeam, phase]);

    return wrapperRef;
}
const EMPTY_SONG_SOURCE = "spotify";
function MusicBattle() {
    const [view, setView] = useState("host"); // host | captain0 | captain1 | player — LOCAL to this device only
    const [state, setState] = useState(null); // shared game state, pushed from server
    const [connected, setConnected] = useState(false);
    const wsRef = useRef(null);
    // local, private-until-submitted inputs — never sent to the server until the
    // relevant action fires, which is exactly what keeps a captain's draft song
    // and a player's in-progress vote invisible to everyone else on the network
    const [songDraft, setSongDraft] = useState(emptySong(EMPTY_SONG_SOURCE));
    const [customStartText, setCustomStartText] = useState("");
    const [myWinnerPick, setMyWinnerPick] = useState(null);
    const [myRatings, setMyRatings] = useState([0, 0]);
    const [voteSubmitted, setVoteSubmitted] = useState(false);
    useEffect(() => {
        const proto = window.location.protocol === "https:" ? "wss" : "ws";
        const socket = new WebSocket(`${proto}://${window.location.host}`);
        wsRef.current = socket;
        socket.onopen = () => setConnected(true);
        socket.onclose = () => setConnected(false);
        socket.onmessage = (evt) => {
            const msg = JSON.parse(evt.data);
            if (msg.type === "STATE")
                setState(msg.state);
            if (msg.type === "SEARCH_RESULTS") {
                window.dispatchEvent(new CustomEvent("song-battle-search-results", { detail: msg }));
            }
        };
        return () => socket.close();
    }, []);
    function dispatch(action) {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "ACTION", action }));
        }
    }
    // reset local drafts whenever the shared state moves into a fresh prep/voting phase
    useEffect(() => {
        if (!state)
            return;
        if (state.phase === "prep") {
            setSongDraft(emptySong(state.defaultSource));
            setCustomStartText("");
        }
        if (state.phase === "voting") {
            setMyWinnerPick(null);
            setMyRatings([0, 0]);
            setVoteSubmitted(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state && state.phase, state && state.round, state && state.isSuddenDeath]);
    const isHostView = view === "host";
    const hostPlayerContainerRef = useYouTubeHostPlayer({
        isHost: isHostView,
        phase: state ? state.phase : null,
        activeTeam: state ? state.activeTeam : 0,
        revealed: state ? state.revealed : [false, false],
        playing: state ? state.playing : false,
        captainSong: state ? state.captainSong : [emptySong("spotify"), emptySong("spotify")],
    });
    if (!state) {
        return (React.createElement("div", { style: { fontFamily: "'Manrope', sans-serif", background: "#100E1A", minHeight: "400px", color: "#F5F3FF", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "10px" } },
            React.createElement(Sparkles, { size: 22, color: "#FFC53D" }),
            React.createElement("p", { className: "disp text-lg" }, "SONG BATTLE"),
            React.createElement("p", { className: "text-xs", style: { color: "#9C96B8" } }, connected ? "Loading game state…" : "Connecting to server…")));
    }
    const { teams, phase, round, totalRounds, activeTeam, isSuddenDeath, captainSong, locked, revealed, songDone, secondsLeft, playing, winnerVotes, ratings, voterCount, votingSecondsLeft, roundWinner, wonByTiebreak, defaultSource } = state;
    const t0 = teams[0], t1 = teams[1];
    const c0 = TEAM_COLORS[0], c1 = TEAM_COLORS[1];
    const turnSeconds = isSuddenDeath ? CONFIG.SUDDEN_DEATH_SECONDS : CONFIG.ROUND_SECONDS;
    const pct = secondsLeft / turnSeconds;
    const activeColor = TEAM_COLORS[activeTeam].main;
    const isCaptain = view === "captain0" || view === "captain1";
    const captainTeam = view === "captain0" ? 0 : 1;
    const isActiveCaptain = isCaptain && captainTeam === activeTeam;
    const trackPosition = (captainSong[activeTeam]?.startAt || 0) + (turnSeconds - secondsLeft);
    const activeSongIsYouTube = captainSong[activeTeam] && captainSong[activeTeam].source === "youtube" && captainSong[activeTeam].videoId;
    function nextRoundLabel() {
        if (isSuddenDeath)
            return t0.score === t1.score ? "SUDDEN DEATH AGAIN 🔥" : "SEE FINAL SCORES";
        if (round >= totalRounds)
            return t0.score === t1.score ? "SUDDEN DEATH! 🔥" : "SEE FINAL SCORES";
        return `START ROUND ${round + 1}`;
    }
    function submitVote() {
        if (myWinnerPick === null)
            return;
        dispatch({ type: "CAST_VOTE", pick: myWinnerPick, r0: myRatings[0], r1: myRatings[1] });
        setVoteSubmitted(true);
    }
    function lockIn() {
        if (!songDraft.title.trim())
            return;
        dispatch({ type: "LOCK_IN", team: captainTeam, song: songDraft });
    }
    function pickYouTubeResult(result) {
        setSongDraft({ ...songDraft, title: result.title, artist: result.channelTitle, videoId: result.videoId, source: "youtube" });
    }
    return (React.createElement("div", { style: { fontFamily: "'Manrope', sans-serif", background: "#100E1A", minHeight: "600px", color: "#F5F3FF", borderRadius: "16px", overflow: "hidden", position: "relative", maxWidth: isHostView ? 960 : 480, margin: "0 auto" } },
        React.createElement("div", { className: "flex items-center justify-between px-4 pt-4 pb-2 flex-wrap gap-2", style: { borderBottom: "1px solid #221F35" } },
            React.createElement("div", { className: "flex items-center gap-2" },
                React.createElement(Sparkles, { size: 18, color: "#FFC53D" }),
                React.createElement("span", { className: "disp text-lg" }, "SONG BATTLE"),
                React.createElement("span", { className: "text-[10px] px-1.5 py-0.5 rounded-full", style: { background: connected ? "#0F3A2A" : "#4A1226", color: connected ? "#2EE6A6" : "#FF3D6E" } }, connected ? "● live" : "○ offline")),
            React.createElement("div", { className: "flex flex-wrap rounded-full p-1 gap-0.5", style: { background: "#1E1B2E" } }, [
                { k: "host", label: "📺 Host" },
                { k: "captain0", label: `🎤 ${t0.name} Capt.` },
                { k: "captain1", label: `🎤 ${t1.name} Capt.` },
                { k: "player", label: "📱 Player" },
            ].map((o) => (React.createElement("button", { key: o.k, onClick: () => setView(o.k), className: "glowbtn px-2.5 py-1.5 rounded-full text-xs font-bold", style: { background: view === o.k ? "#FFC53D" : "transparent", color: view === o.k ? "#100E1A" : "#9C96B8" } }, o.label))))),
        React.createElement("div", { className: "p-5", style: { minHeight: "540px" } },
            React.createElement("div", { ref: hostPlayerContainerRef, style: isHostView && phase === "turn" && revealed[activeTeam] && activeSongIsYouTube
                    ? { width: "100%", maxWidth: "calc(48vh * 16 / 9)", aspectRatio: "16 / 9", margin: "0 auto 16px", borderRadius: 12, overflow: "hidden", background: "#000" }
                    : { width: 1, height: 1, overflow: "hidden", opacity: 0, position: "absolute", pointerEvents: "none" } }),
            phase === "setup" && (React.createElement("div", { className: "flex flex-col gap-5 max-w-md mx-auto pt-6" },
                React.createElement("div", { className: "flex items-center gap-2 justify-center" },
                    React.createElement(Tv, { size: 16, color: "#9C96B8" }),
                    React.createElement("p", { className: "text-center text-sm", style: { color: "#9C96B8" } }, "Works like Kahoot: the host screen just plays music and displays the room. Every device here is now talking to the same live game.")),
                [0, 1].map((i) => (React.createElement("div", { key: i },
                    React.createElement("label", { className: "text-xs font-bold uppercase tracking-wide", style: { color: TEAM_COLORS[i].main } },
                        "Team ",
                        i + 1,
                        " name"),
                    React.createElement("input", { value: teams[i].name, onChange: (e) => dispatch({ type: "SET_TEAM_NAME", team: i, name: e.target.value }), className: "w-full mt-1 px-3 py-2 rounded-lg outline-none", style: { background: "#1E1B2E", border: `1px solid ${TEAM_COLORS[i].dim}`, color: "#F5F3FF" } })))),
                React.createElement("div", null,
                    React.createElement("label", { className: "text-xs font-bold uppercase tracking-wide", style: { color: "#9C96B8" } }, "Number of rounds"),
                    React.createElement("div", { className: "flex gap-2 mt-1" }, CONFIG.ROUND_OPTIONS.map((n) => (React.createElement("button", { key: n, onClick: () => dispatch({ type: "SET_TOTAL_ROUNDS", n }), className: "glowbtn flex-1 py-2 rounded-lg font-bold", style: { background: totalRounds === n ? "#FFC53D" : "#1E1B2E", color: totalRounds === n ? "#100E1A" : "#F5F3FF" } }, n)))),
                    React.createElement("p", { className: "text-[10px] mt-1", style: { color: "#635D80" } }, "Odd counts mean fewer overall ties \u2014 any that remain go to sudden death.")),
                React.createElement("div", null,
                    React.createElement("label", { className: "text-xs font-bold uppercase tracking-wide block text-center", style: { color: "#9C96B8" } }, "Default platform for this room"),
                    React.createElement("p", { className: "text-[10px] text-center mb-1", style: { color: "#635D80" } }, "Captains can still switch per song."),
                    React.createElement(PlatformPicker, { value: defaultSource, onChange: (k) => dispatch({ type: "SET_DEFAULT_SOURCE", source: k }) })),
                React.createElement("button", { onClick: () => dispatch({ type: "START_GAME" }), className: "glowbtn mt-3 py-3 rounded-lg disp text-lg", style: { background: "linear-gradient(90deg,#FF3D6E,#3DD6F5)", color: "#100E1A" } }, "START GAME"))),
            phase === "intro" && (React.createElement("div", { className: "flex flex-col items-center justify-center gap-6 pt-10" },
                isSuddenDeath ? (React.createElement("span", { className: "disp text-xl flex items-center gap-2", style: { color: "#FF3D6E" } },
                    React.createElement(Flame, { size: 22 }),
                    " SUDDEN DEATH")) : (React.createElement("span", { className: "text-xs font-bold tracking-widest", style: { color: "#9C96B8" } },
                    "ROUND ",
                    round,
                    " OF ",
                    totalRounds)),
                React.createElement("div", { className: "flex items-center gap-4" },
                    React.createElement("span", { className: "disp text-3xl text-center", style: { color: c0.main } }, t0.name),
                    React.createElement("span", { className: "disp text-2xl", style: { color: "#FFC53D" } }, "VS"),
                    React.createElement("span", { className: "disp text-3xl text-center", style: { color: c1.main } }, t1.name)),
                isSuddenDeath ? (React.createElement("p", { className: "text-xs text-center max-w-xs", style: { color: "#9C96B8" } }, "Scores are tied. One head-to-head \u2014 cue straight to the hook or chorus.")) : (React.createElement("p", { className: "text-xs text-center max-w-xs", style: { color: "#9C96B8" } }, "Draw your physical artist card at the table. Card draw opens automatically\u2026")))),
            phase === "prep" && (React.createElement("div", { className: "flex flex-col gap-6 pt-2" },
                isCaptain && (React.createElement("div", { className: "max-w-sm mx-auto w-full" },
                    React.createElement("div", { className: "flex items-center gap-2 justify-center mb-3" },
                        React.createElement(EyeOff, { size: 16, color: TEAM_COLORS[captainTeam].main }),
                        React.createElement("span", { className: "text-xs font-bold", style: { color: TEAM_COLORS[captainTeam].main } },
                            "PRIVATE \u2014 ",
                            teams[captainTeam].name,
                            " CAPTAIN ONLY")),
                    !locked[captainTeam] ? (React.createElement("div", { className: "flex flex-col gap-2" },
                        isSuddenDeath && (React.createElement("p", { className: "text-xs text-center flex items-center justify-center gap-1", style: { color: "#FF3D6E" } },
                            React.createElement(Flame, { size: 13 }),
                            " Sudden death: only ",
                            CONFIG.SUDDEN_DEATH_SECONDS,
                            "s plays \u2014 pick the hook/chorus")),
                        React.createElement(PlatformPicker, { value: songDraft.source, onChange: (k) => setSongDraft({ ...songDraft, source: k, videoId: k === "youtube" ? songDraft.videoId : null }) }),
                        songDraft.source === "youtube" ? (React.createElement(React.Fragment, null,
                            React.createElement(YouTubeSearchBox, { dispatch: dispatch, onPick: pickYouTubeResult, teamColor: TEAM_COLORS[captainTeam].main }),
                            songDraft.videoId && (React.createElement("div", { className: "px-3 py-2 rounded-lg text-center", style: { background: TEAM_COLORS[captainTeam].dim } },
                                React.createElement("p", { className: "text-xs font-bold" }, songDraft.title),
                                React.createElement("p", { className: "text-[10px]", style: { color: "#9C96B8" } }, songDraft.artist))))) : (React.createElement(React.Fragment, null,
                            React.createElement("p", { className: "text-xs text-center", style: { color: "#9C96B8" } }, "Enter the song you're playing for your artist card (simulated search \u2014 real search coming for this platform)"),
                            React.createElement("input", { placeholder: "Song title", value: songDraft.title, onChange: (e) => setSongDraft({ ...songDraft, title: e.target.value }), className: "px-3 py-2 rounded-lg outline-none", style: { background: "#1E1B2E", border: `1px solid ${TEAM_COLORS[captainTeam].dim}`, color: "#F5F3FF" } }),
                            React.createElement("input", { placeholder: "Artist", value: songDraft.artist, onChange: (e) => setSongDraft({ ...songDraft, artist: e.target.value }), className: "px-3 py-2 rounded-lg outline-none", style: { background: "#1E1B2E", border: `1px solid ${TEAM_COLORS[captainTeam].dim}`, color: "#F5F3FF" } }))),
                        React.createElement("div", { className: "mt-2 flex items-center gap-1.5 justify-center" },
                            React.createElement(SkipForward, { size: 13, color: TEAM_COLORS[captainTeam].main }),
                            React.createElement("span", { className: "text-xs font-bold", style: { color: TEAM_COLORS[captainTeam].main } }, "Cue to the good part")),
                        React.createElement("div", { className: "flex gap-1.5 flex-wrap justify-center" }, CONFIG.START_PRESETS.map((sec) => (React.createElement("button", { key: sec, onClick: () => { setSongDraft({ ...songDraft, startAt: sec }); setCustomStartText(""); }, className: "glowbtn px-3 py-1.5 rounded-full text-xs font-bold", style: { background: songDraft.startAt === sec ? TEAM_COLORS[captainTeam].main : "#1E1B2E", color: songDraft.startAt === sec ? "#100E1A" : "#9C96B8", border: `1px solid ${TEAM_COLORS[captainTeam].dim}` } }, fmt(sec))))),
                        React.createElement("input", { placeholder: "Custom start, e.g. 1:15", value: customStartText, onChange: (e) => { setCustomStartText(e.target.value); setSongDraft({ ...songDraft, startAt: parseTimeStr(e.target.value) }); }, className: "px-3 py-2 rounded-lg outline-none text-center text-sm", style: { background: "#1E1B2E", border: `1px solid ${TEAM_COLORS[captainTeam].dim}`, color: "#F5F3FF" } }),
                        React.createElement("p", { className: "text-[10px] text-center", style: { color: "#635D80" } },
                            "Playback will start at ",
                            fmt(songDraft.startAt),
                            " and run for ",
                            fmt(turnSeconds)),
                        React.createElement("button", { onClick: lockIn, disabled: !songDraft.title.trim(), className: "glowbtn mt-1 py-2.5 rounded-lg disp flex items-center justify-center gap-2", style: { background: TEAM_COLORS[captainTeam].main, color: "#100E1A", opacity: songDraft.title.trim() ? 1 : 0.4 } },
                            React.createElement(Lock, { size: 16 }),
                            " LOCK IN SECRETLY"))) : (React.createElement("div", { className: "flex flex-col items-center gap-2 pt-6" },
                        React.createElement("span", { className: "disp text-xl", style: { color: TEAM_COLORS[captainTeam].main } }, "\uD83E\uDD2B LOCKED IN"),
                        React.createElement("p", { className: "text-xs text-center", style: { color: "#9C96B8" } }, locked[0] && locked[1] ? "Both teams ready — starting the reveal round…" : "Keep it secret! Waiting on the other captain…"))))),
                !isCaptain && (React.createElement("div", { className: "flex flex-col items-center gap-6 pt-6" },
                    React.createElement("span", { className: "disp text-lg", style: { color: "#FFC53D" } }, "\uD83C\uDFB4 CAPTAINS ARE LOCKING IN"),
                    React.createElement("div", { className: "flex gap-8" }, [0, 1].map((i) => (React.createElement("div", { key: i, className: "flex flex-col items-center gap-2" },
                        React.createElement("span", { className: "text-xs font-bold", style: { color: TEAM_COLORS[i].main } }, teams[i].name),
                        locked[i] ? React.createElement("span", { className: "text-2xl" }, "\u2705") : React.createElement("span", { className: "text-2xl animate-pulse" }, "\u23F3"))))),
                    React.createElement("p", { className: "text-xs", style: { color: "#9C96B8" } }, locked[0] && locked[1] ? "Both locked in — starting automatically…" : "The round begins the moment both captains lock in."))))),
            phase === "turn" && (React.createElement("div", { className: "flex flex-col items-center gap-5 pt-4" },
                isSuddenDeath && React.createElement("span", { className: "disp text-sm flex items-center gap-1", style: { color: "#FF3D6E" } },
                    React.createElement(Flame, { size: 14 }),
                    " SUDDEN DEATH \u00B7 ",
                    CONFIG.SUDDEN_DEATH_SECONDS,
                    "s"),
                React.createElement("span", { className: "disp text-xl", style: { color: activeColor } },
                    teams[activeTeam].name,
                    "'s Turn"),
                !revealed[activeTeam] && (React.createElement("div", { className: "flex flex-col items-center gap-4" },
                    React.createElement(MysteryCard, { color: activeColor }),
                    React.createElement("p", { className: "text-xs", style: { color: "#9C96B8" } }, "Track locked in \u2014 hidden until it plays"),
                    isActiveCaptain && (React.createElement("button", { onClick: () => dispatch({ type: "REVEAL_AND_PLAY" }), className: "glowbtn px-6 py-3 rounded-lg disp flex items-center gap-2", style: { background: activeColor, color: "#100E1A" } },
                        React.createElement(Play, { size: 18 }),
                        " REVEAL & PLAY")),
                    !isActiveCaptain && React.createElement("p", { className: "text-sm", style: { color: "#9C96B8" } },
                        "Waiting for ",
                        teams[activeTeam].name,
                        "'s captain to hit play, whenever they're ready\u2026"))),
                revealed[activeTeam] && (React.createElement("div", { className: "flex flex-col items-center gap-4" },
                    React.createElement("div", { className: "relative flex items-center justify-center" },
                        React.createElement(TimerRing, { pct: playing ? pct : songDone[activeTeam] ? 0 : 1, color: activeColor, size: isHostView ? 150 : 220 }),
                        React.createElement("div", { className: "absolute flex flex-col items-center" },
                            React.createElement("span", { className: "disp text-4xl" }, fmt(secondsLeft)),
                            playing && React.createElement("span", { className: "flex items-center gap-1 text-xs mt-1", style: { color: activeColor } },
                                React.createElement(Radio, { size: 12, className: "animate-pulse" }),
                                " PLAYING"),
                            songDone[activeTeam] && React.createElement("span", { className: "text-xs mt-1", style: { color: "#9C96B8" } }, "TIME'S UP"))),
                    React.createElement("div", { className: "text-center px-4 py-2 rounded-lg", style: { background: TEAM_COLORS[activeTeam].dim } },
                        React.createElement("div", { className: "flex justify-center mb-1" },
                            React.createElement(SourceBadge, { source: captainSong[activeTeam].source })),
                        React.createElement("p", { className: "font-extrabold text-lg" }, captainSong[activeTeam].title),
                        React.createElement("p", { className: "text-sm", style: { color: "#9C96B8" } }, captainSong[activeTeam].artist),
                        React.createElement("p", { className: "text-xs mt-1 flex items-center justify-center gap-1", style: { color: activeColor } },
                            React.createElement(SkipForward, { size: 11 }),
                            " cued from ",
                            fmt(captainSong[activeTeam].startAt),
                            playing && React.createElement("span", { style: { color: "#9C96B8" } },
                                "\u00B7 now at ",
                                fmt(trackPosition)))),
                    isActiveCaptain && playing && (React.createElement("button", { onClick: () => dispatch({ type: "STOP_SONG" }), className: "glowbtn px-5 py-2 rounded-lg flex items-center gap-2 font-bold", style: { background: "#2A2640", color: "#F5F3FF" } },
                        React.createElement(Square, { size: 16 }),
                        " Stop early")),
                    songDone[activeTeam] && !songDone[1 - activeTeam] && (view === `captain${1 - activeTeam}` ? (React.createElement("button", { onClick: () => dispatch({ type: "NEXT_TURN" }), className: "glowbtn px-6 py-3 rounded-lg disp flex items-center gap-2", style: { background: "#FFC53D", color: "#100E1A" } },
                        "START OUR TURN ",
                        React.createElement(ChevronRight, { size: 18 }))) : (React.createElement("p", { className: "text-xs", style: { color: "#9C96B8" } },
                        "Waiting for ",
                        teams[1 - activeTeam].name,
                        "'s captain to start their turn\u2026"))),
                    songDone[activeTeam] && songDone[1 - activeTeam] && (view !== "host" ? (React.createElement("button", { onClick: () => dispatch({ type: "NEXT_TURN" }), className: "glowbtn px-6 py-3 rounded-lg disp flex items-center gap-2", style: { background: "#FFC53D", color: "#100E1A" } },
                        "GO TO VOTING ",
                        React.createElement(ChevronRight, { size: 18 }))) : (React.createElement("p", { className: "text-xs", style: { color: "#9C96B8" } }, "Both songs played \u2014 moving to voting\u2026"))))))),
            phase === "voting" && (React.createElement("div", { className: "flex flex-col gap-5 pt-2" },
                React.createElement("span", { className: "disp text-xl text-center", style: { color: "#FFC53D" } }, "\uD83D\uDDF3\uFE0F VOTE NOW"),
                React.createElement("div", { className: "grid grid-cols-2 gap-3" }, [0, 1].map((i) => (React.createElement("div", { key: i, className: "rounded-xl p-3 text-center", style: { background: TEAM_COLORS[i].dim, border: `1px solid ${TEAM_COLORS[i].main}55` } },
                    React.createElement("p", { className: "text-xs font-bold", style: { color: TEAM_COLORS[i].main } }, teams[i].name),
                    React.createElement("div", { className: "flex justify-center my-1" },
                        React.createElement(SourceBadge, { source: captainSong[i].source })),
                    React.createElement("p", { className: "font-bold text-sm mt-1" }, captainSong[i].title),
                    React.createElement("p", { className: "text-xs", style: { color: "#9C96B8" } }, captainSong[i].artist),
                    React.createElement("p", { className: "text-[10px] mt-1", style: { color: "#635D80" } },
                        "cued from ",
                        fmt(captainSong[i].startAt)))))),
                view === "host" && (React.createElement("div", { className: "flex flex-col items-center gap-3 mt-2" },
                    React.createElement("div", { className: "flex flex-col items-center", style: { minHeight: "80px", justifyContent: "center" } },
                        React.createElement("span", { className: `disp vote-timer ${votingSecondsLeft <= CONFIG.VOTE_URGENT_THRESHOLD ? "urgent" : ""}`, style: { fontSize: votingSecondsLeft <= CONFIG.VOTE_URGENT_THRESHOLD ? "3.25rem" : "2.25rem", color: votingSecondsLeft <= CONFIG.VOTE_URGENT_THRESHOLD ? "#FF3D6E" : "#FFC53D" } }, votingSecondsLeft),
                        React.createElement("span", { className: "text-xs", style: { color: "#9C96B8" } }, "seconds left to vote")),
                    React.createElement("div", { className: "flex items-center gap-2 text-sm", style: { color: "#9C96B8" } },
                        React.createElement(Users, { size: 16 }),
                        " ",
                        voterCount,
                        " vote",
                        voterCount === 1 ? "" : "s",
                        " cast so far"),
                    React.createElement("div", { className: "grid grid-cols-2 gap-3 w-full max-w-sm" }, [0, 1].map((i) => (React.createElement("div", { key: i, className: "text-center" },
                        React.createElement("p", { className: "disp text-3xl", style: { color: TEAM_COLORS[i].main } }, winnerVotes[i]),
                        React.createElement("p", { className: "text-xs", style: { color: "#9C96B8" } }, "winner votes"),
                        React.createElement("p", { className: "text-sm mt-1" },
                            "\u2B50 ",
                            avg(ratings[i]),
                            " vibe match"))))),
                    React.createElement("p", { className: "text-[10px]", style: { color: "#635D80" } }, "Tied on votes? Highest vibe rating breaks the tie."))),
                (view === "player" || isCaptain) && !voteSubmitted && (React.createElement("div", { className: "flex flex-col gap-4" },
                    React.createElement("div", { className: "flex items-center justify-center gap-1.5" },
                        React.createElement("span", { className: `disp vote-timer ${votingSecondsLeft <= CONFIG.VOTE_URGENT_THRESHOLD ? "urgent" : ""}`, style: { fontSize: "1.1rem", color: votingSecondsLeft <= CONFIG.VOTE_URGENT_THRESHOLD ? "#FF3D6E" : "#FFC53D" } },
                            "\u23F1 ",
                            fmt(votingSecondsLeft)),
                        React.createElement("span", { className: "text-xs", style: { color: "#9C96B8" } }, "left to vote")),
                    React.createElement("p", { className: "text-xs text-center", style: { color: "#9C96B8" } }, "Pick who wins the room, then rate how well each song matches the category's vibe (also breaks ties!)"),
                    React.createElement("div", { className: "grid grid-cols-2 gap-3" }, [0, 1].map((i) => (React.createElement("button", { key: i, onClick: () => setMyWinnerPick(i), className: "glowbtn py-2 rounded-lg font-bold text-sm", style: { background: myWinnerPick === i ? TEAM_COLORS[i].main : "#1E1B2E", color: myWinnerPick === i ? "#100E1A" : "#F5F3FF", border: `1px solid ${TEAM_COLORS[i].main}` } },
                        "Vote ",
                        teams[i].name)))),
                    [0, 1].map((i) => (React.createElement("div", { key: i, className: "flex flex-col gap-1 px-1 pb-2", style: { borderBottom: i === 0 ? "1px solid #221F35" : "none" } },
                        React.createElement("span", { className: "text-xs", style: { color: "#9C96B8" } },
                            teams[i].name,
                            " \u2014 does it match the vibe of the category?"),
                        React.createElement(StarPicker, { value: myRatings[i], onChange: (v) => { const n = [...myRatings]; n[i] = v; setMyRatings(n); }, color: TEAM_COLORS[i].main })))),
                    React.createElement("button", { onClick: submitVote, disabled: myWinnerPick === null, className: "glowbtn py-3 rounded-lg disp", style: { background: "#FFC53D", color: "#100E1A", opacity: myWinnerPick === null ? 0.4 : 1 } }, "SUBMIT VOTE"))),
                (view === "player" || isCaptain) && voteSubmitted && (React.createElement("div", { className: "flex flex-col items-center gap-3 pt-4" },
                    React.createElement("p", { className: "font-bold" }, "\u2705 Vote submitted!"),
                    React.createElement("span", { className: `disp vote-timer ${votingSecondsLeft <= CONFIG.VOTE_URGENT_THRESHOLD ? "urgent" : ""}`, style: { fontSize: "1.5rem", color: votingSecondsLeft <= CONFIG.VOTE_URGENT_THRESHOLD ? "#FF3D6E" : "#FFC53D" } }, fmt(votingSecondsLeft)),
                    React.createElement("p", { className: "text-xs", style: { color: "#9C96B8" } },
                        voterCount,
                        " vote",
                        voterCount === 1 ? "" : "s",
                        " in so far."),
                    React.createElement("div", { className: "flex gap-2 mt-1" },
                        React.createElement("button", { onClick: () => setVoteSubmitted(false), className: "glowbtn px-4 py-2 rounded-lg text-xs font-bold", style: { background: "#1E1B2E", color: "#9C96B8" } }, "\u21BB Vote again from this device (testing)"),
                        React.createElement("button", { onClick: () => dispatch({ type: "CLOSE_VOTING" }), className: "glowbtn px-4 py-2 rounded-lg text-xs font-bold", style: { background: "#FFC53D", color: "#100E1A" } }, "Close voting & reveal")))))),
            phase === "results" && (React.createElement("div", { className: "flex flex-col items-center gap-5 pt-8" },
                isSuddenDeath && React.createElement("span", { className: "disp text-sm flex items-center gap-1", style: { color: "#FF3D6E" } },
                    React.createElement(Flame, { size: 14 }),
                    " SUDDEN DEATH RESULT"),
                roundWinner === null ? (React.createElement("span", { className: "disp text-2xl" }, "IT'S A TIE!")) : (React.createElement(React.Fragment, null,
                    React.createElement("span", { className: "text-xs tracking-widest", style: { color: "#9C96B8" } }, isSuddenDeath ? "SUDDEN DEATH WINNER" : `ROUND ${round} WINNER`),
                    React.createElement("span", { className: "disp text-4xl", style: { color: TEAM_COLORS[roundWinner].main, textShadow: `0 0 24px ${TEAM_COLORS[roundWinner].glow}` } }, teams[roundWinner].name),
                    wonByTiebreak && React.createElement("span", { className: "flex items-center gap-1 text-xs", style: { color: "#FFC53D" } },
                        React.createElement(Target, { size: 13 }),
                        " Votes were tied \u2014 won on vibe rating"),
                    React.createElement(Trophy, { size: 40, color: "#FFC53D" }))),
                React.createElement("div", { className: "flex gap-6" }, [0, 1].map((i) => (React.createElement("div", { key: i, className: "text-center px-3 py-2 rounded-lg", style: { background: "#1E1B2E" } },
                    React.createElement("p", { className: "text-[10px] font-bold", style: { color: TEAM_COLORS[i].main } }, teams[i].name),
                    React.createElement("p", { className: "text-sm font-bold mt-0.5" },
                        winnerVotes[i],
                        " vote",
                        winnerVotes[i] === 1 ? "" : "s"),
                    React.createElement("p", { className: "text-xs", style: { color: "#9C96B8" } },
                        "\u2B50 ",
                        avg(ratings[i]),
                        " vibe"))))),
                React.createElement("div", { className: "flex gap-8 mt-2" }, [0, 1].map((i) => (React.createElement("div", { key: i, className: "text-center" },
                    React.createElement("p", { className: "text-xs", style: { color: TEAM_COLORS[i].main } }, teams[i].name),
                    React.createElement("p", { className: "disp text-3xl" }, teams[i].score))))),
                view !== "host" && (React.createElement("button", { onClick: () => dispatch({ type: "NEXT_ROUND" }), className: "glowbtn mt-3 px-6 py-3 rounded-lg disp flex items-center gap-2", style: { background: "linear-gradient(90deg,#FF3D6E,#3DD6F5)", color: "#100E1A" } },
                    nextRoundLabel(),
                    " ",
                    React.createElement(ChevronRight, { size: 18 }))),
                view === "host" && React.createElement("p", { className: "text-xs", style: { color: "#635D80" } }, "Waiting for a captain or player to continue\u2026"))),
            phase === "final" && (React.createElement("div", { className: "flex flex-col items-center gap-6 pt-8" },
                React.createElement("span", { className: "disp text-2xl", style: { color: "#FFC53D" } }, "\uD83C\uDFC6 FINAL SCORE"),
                (() => {
                    const champ = t0.score === t1.score ? null : t0.score > t1.score ? 0 : 1;
                    return champ !== null
                        ? React.createElement("span", { className: "disp text-3xl", style: { color: TEAM_COLORS[champ].main } },
                            teams[champ].name,
                            " WINS THE PARTY!")
                        : React.createElement("span", { className: "disp text-2xl" }, "IT'S A DEAD HEAT!");
                })(),
                React.createElement("div", { className: "flex gap-10" }, [0, 1].map((i) => (React.createElement("div", { key: i, className: "text-center" },
                    React.createElement("p", { className: "text-sm font-bold", style: { color: TEAM_COLORS[i].main } }, teams[i].name),
                    React.createElement("p", { className: "disp text-5xl" }, teams[i].score))))),
                React.createElement("button", { onClick: () => dispatch({ type: "PLAY_AGAIN" }), className: "glowbtn mt-2 px-6 py-3 rounded-lg disp flex items-center gap-2", style: { background: "#1E1B2E", color: "#F5F3FF", border: "1px solid #3A3555" } },
                    React.createElement(RotateCcw, { size: 18 }),
                    " PLAY AGAIN"))))));
}
const rootEl = document.getElementById("root");
const root = ReactDOM.createRoot(rootEl);
root.render(React.createElement(MusicBattle, null));


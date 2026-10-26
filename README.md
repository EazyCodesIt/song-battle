# Song Battle — local multiplayer setup

## Run it

No install step needed — this uses only Node's built-in modules.

```
node server.js
```

You'll see something like:

```
Song Battle server running.
On this computer:  http://localhost:3000
On other devices:  http://<this-computer's-LAN-IP>:3000
```

## Find your computer's LAN IP

- **Mac:** System Settings → Wi-Fi → Details, or run `ipconfig getifaddr en0` in Terminal
- **Windows:** run `ipconfig` in Command Prompt, look for "IPv4 Address"
- **Linux:** run `hostname -I`

## Connect every device

Every phone/laptop must be on the **same WiFi network** as the computer running the server
(not cellular data, and not an isolated "guest" network — some routers block devices on a
guest network from reaching each other, which will look like it's just not connecting).

Open `http://<that-IP>:3000` on each device, then pick a role from the tabs at the top
(Host, either team's Captain, or Player). All of them are now talking to the same live game —
a captain locking in a song on their phone shows up on the host's screen in real time, and
votes tally live across every device.

## Enabling HTTPS (needed for real Spotify/Apple Music SDKs)

Real music SDKs (Spotify Web Playback SDK, Apple MusicKit JS) require a "secure context" —
they won't work over plain `http://`, only `https://` (or `localhost`, which browsers treat
as secure automatically — but that only helps the computer running the server, not phones
connecting to it over the LAN).

The server automatically switches to HTTPS if it finds `cert.pem` and `key.pem` sitting next
to `server.js` — otherwise it falls back to plain HTTP exactly as before, so this step is
optional until you're ready to test real playback.

### Generate a local certificate

In Terminal, in the project folder, first find your Mac's LAN IP (see above), then run:

```
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:<your-LAN-IP>"
```

Replace `<your-LAN-IP>` with the real address (e.g. `192.168.1.42`). This creates `key.pem`
and `cert.pem` in the folder — the server picks them up automatically next time it starts.

### Run it

```
node server.js
```

The startup log will confirm it switched to HTTPS. Visit `https://<your-LAN-IP>:3000` on
each device.

### The certificate warning (expected, one-time per device)

Since this is a self-signed certificate (not issued by a trusted authority), every browser
will show a warning the first time — "Your connection is not private," "This connection is
not secure," or similar. This is normal and expected for local dev/testing. Choose
**Advanced → Proceed anyway** (wording varies by browser). You only need to do this once per
device; the browser remembers your choice for that certificate afterward.

### If your LAN IP changes

Home routers often hand out the same IP to the same device, but if yours changes (new
network, router reboot, etc.), the old certificate's IP won't match anymore and you'll need
to regenerate it with the new IP using the same command above.

## Project files

- `server.js`: game server (state, timers, WebSocket sync, YouTube search)
- `index.html`: page shell that loads React and `app.js`
- `app.js`: the whole client app. This is the real source; there is no build step.
- `app.css`: styles

Upload all four (plus `package.json`) to GitHub. Render redeploys on each push.

## Making gameplay tweaks

Timers and rules live in the `CONFIG` block near the top of `server.js` (this is the copy
that actually governs behavior — restart the server after changing it). `index.html` has a
matching `CONFIG` block used only for on-screen labels/options; keep the two in sync if you
change timing values, so what's displayed matches what's enforced.

Restart the server (`Ctrl+C`, then `node server.js` again) after any edit to `server.js`.
`index.html` just needs a browser refresh on each device — no restart needed.

## YouTube search & playback

Requires a `YOUTUBE_API_KEY` environment variable (a free Google Cloud API key with the
YouTube Data API v3 enabled). Without it, the server still runs fine — song search just
returns an error, and captains fall back to manual title/artist entry for that platform.

Real playback only happens on the **host device**, using the YouTube IFrame Player API —
captains and players never need their own YouTube account. When deployed to Render, the key
goes in as a private Environment Variable, never committed to the repo.

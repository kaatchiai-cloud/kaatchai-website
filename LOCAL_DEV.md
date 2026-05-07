# Running Stori Locally

## Requirements

- Node.js (for the Kling proxy)
- Any static file server (`npx serve` or `python3`)

---

## Step 1 — Build (if you've changed source files)

```bash
node build.js
```

Output: `dist/index.html` (fully bundled, ~2.5MB)

---

## Step 2 — Start static file server

```bash
npx serve . -l 8080
# or
python3 -m http.server 8080
```

Open: **http://localhost:8080/dist/index.html**

> Must use `localhost` — not `file://`. MediaPipe WASM and dynamic imports are blocked on `file://`.

---

## Step 3 — Start Kling proxy (video generation only)

Required only if using animated video generation. Handles CORS for Kling's API.

```bash
node marketing-pipeline/kling-proxy.js
# Listens on port 3004
```

The app auto-detects `localhost` and routes Kling calls through this proxy instead of the Vercel serverless function.

---

## API Keys

Enter once via the in-app keys panel — saved to `localStorage`, persisted across sessions.

| Key | Feature | Where to get |
|---|---|---|
| Gemini (free or paid) | TTS, story generation, autopilot | [Google AI Studio](https://aistudio.google.com) |
| ElevenLabs | Word-level audio alignment (Scribe) | [ElevenLabs dashboard](https://elevenlabs.io) |
| Kling Access Key + Secret Key | Animated video generation | [Kling AI console](https://klingai.com) |
| fal.ai | Lip sync Tier 2 (Kling LipSync) | [fal.ai dashboard](https://fal.ai) |
| Anthropic | Brainstorm wizard (Claude) | [Anthropic console](https://console.anthropic.com) |
| OpenAI | Brainstorm wizard (GPT) | [OpenAI platform](https://platform.openai.com) |

---

## What works without keys

- Audio import, editing, silence removal
- Photo / video timeline
- Export (WAV/MP4)

## What needs keys

| Feature | Key needed |
|---|---|
| TTS + script generation + autopilot | Gemini |
| Subtitle word alignment | ElevenLabs |
| Animated video generation | Kling + proxy running |
| Lip sync Tier 2 | fal.ai |
| Brainstorm wizard | Anthropic or OpenAI |

---

## MediaPipe (lip sync Tier 1)

Loaded automatically from jsDelivr CDN (~10MB, one-time per browser). No setup needed. Cached after first load — subsequent sessions are instant.

---

## Production (Vercel)

On Vercel, the Kling proxy is replaced by the `api/kling.js` serverless function — no local proxy needed. Everything else is identical.

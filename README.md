# MindMirror — Private Voice Journal

A voice-first emotional journaling app. Speak freely. Get coached back. Everything stays on your device.
No backend. No cloud. No API keys. All AI runs in the browser via WebAssembly.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript + Vite |
| AI Runtime | RunAnywhere Web SDK (WASM) |
| STT | Whisper Tiny EN via sherpa-onnx (~105MB) |
| LLM | LiquidAI LFM2-350M via llama.cpp (~250MB) |
| TTS | Piper TTS via sherpa-onnx (~65MB) |
| VAD | Silero VAD v5 (~5MB) |
| Storage | IndexedDB via `idb` (local, private) |
| Fonts | DM Serif Display + DM Sans |
| Deploy | Vercel / Netlify (static) |

---

## Project Structure

```
mindmirror/
├── index.html
├── vite.config.ts          # COOP/COEP headers for SharedArrayBuffer
├── package.json
├── tsconfig.json
└── src/
    ├── main.tsx
    ├── App.tsx              # View router (loader → history → journal → detail)
    ├── runanywhere.ts       # SDK init + model catalog + loader helper
    ├── db.ts                # IndexedDB schema: sessions, entries, insights
    ├── hooks/
    │   ├── useVoicePipeline.ts   # VAD + VoicePipeline orchestration
    │   └── useSessionSummary.ts  # LLM-generated session title/mood/summary
    ├── components/
    │   └── ModelLoader.tsx       # Download progress UI (first-time load)
    ├── pages/
    │   ├── JournalPage.tsx       # Live voice journaling screen
    │   ├── HistoryPage.tsx       # Past sessions list with mood scores
    │   └── SessionDetailPage.tsx # Full transcript view
    └── styles/
        └── global.css
```

---

## Database Schema (IndexedDB)

### `sessions`
| Field | Type | Description |
|-------|------|-------------|
| id | string (UUID) | Primary key |
| startedAt | number | Unix timestamp |
| endedAt | number \| null | Set when session ends |
| title | string | LLM-generated 5-word title |
| moodScore | number \| null | 1–10 mood rating from LLM |
| moodLabel | string \| null | e.g. "anxious", "hopeful", "calm" |
| summary | string \| null | 1–2 sentence LLM summary |
| turnCount | number | Number of voice turns |

### `entries`
| Field | Type | Description |
|-------|------|-------------|
| id | string (UUID) | Primary key |
| sessionId | string | Foreign key → sessions.id |
| timestamp | number | Unix timestamp |
| role | "user" \| "coach" | Who spoke |
| transcript | string | STT output or LLM text |

### `insights`
| Field | Type | Description |
|-------|------|-------------|
| id | string (UUID) | Primary key |
| generatedAt | number | Unix timestamp |
| type | "pattern" \| "streak" \| "shift" | Insight category |
| title | string | Short insight title |
| body | string | Full insight text |
| relatedSessionIds | string[] | Sessions this insight references |

---

## AI Integration

### Voice Pipeline (RunAnywhere SDK)
```
Microphone → AudioCapture → VAD (Silero) → speech segment
→ VoicePipeline.processTurn(audio, options, callbacks)
  ├── STT: Whisper Tiny → transcript
  ├── LLM: LFM2-350M → coach response (streaming)
  └── TTS: Piper TTS → spoken audio → AudioPlayback
```

### Session Summary (post-session)
After ending a session, `useSessionSummary` calls `TextGeneration.generateStream()` with a
structured JSON prompt asking the LLM to return `{ title, moodLabel, moodScore, summary }`.
The response is parsed and persisted to IndexedDB.

### Models loaded with `coexist: true`
All 4 models (VAD + STT + LLM + TTS) must be in memory simultaneously.
This is why `ModelManager.loadModel(id, { coexist: true })` is used for every model.

---

## How to Run Locally

### Prerequisites
- Node.js 18+
- Chrome 120+ or Edge 120+ (required for WebGPU/SharedArrayBuffer)
- ~500MB disk space for models (downloaded once, cached in OPFS)

### Steps

```bash
# 1. Clone the RunAnywhere web starter (or use this repo directly)
git clone https://github.com/RunanywhereAI/web-starter-app mindmirror
cd mindmirror

# 2. Replace src/ with the MindMirror src/ files
# (copy all files from this project into the cloned repo)

# 3. Install dependencies
npm install

# 4. Start dev server
npm run dev
```

Open `http://localhost:5173` in Chrome.

**First load:** ~430MB of models will download from HuggingFace and be cached in your
browser's OPFS (Origin Private File System). Subsequent loads are instant.

### Why Chrome only?
The RunAnywhere WASM engine requires `SharedArrayBuffer` for multi-threaded inference,
which requires Cross-Origin Isolation headers (`COOP` + `COEP`). The `vite.config.ts`
already sets these for local dev. Safari has partial support; Firefox works but is slower.

---

## Deployment Guide

### Vercel (recommended — fastest)

```bash
npm run build
npx vercel --prod
```

**Critical:** You must add COOP/COEP headers in `vercel.json`:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
      ]
    }
  ]
}
```

### Netlify

Add a `netlify.toml` at root:

```toml
[[headers]]
  for = "/*"
  [headers.values]
    Cross-Origin-Opener-Policy = "same-origin"
    Cross-Origin-Embedder-Policy = "require-corp"
```

Then:
```bash
npm run build
npx netlify deploy --prod --dir=dist
```

### Docker (self-hosted)

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

`nginx.conf`:
```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;

  add_header Cross-Origin-Opener-Policy "same-origin";
  add_header Cross-Origin-Embedder-Policy "require-corp";

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

```bash
docker build -t mindmirror .
docker run -p 8080:80 mindmirror
```

---

## Hackathon Demo Script

1. Open the app → watch 4 models load (one-time, ~2 min)
2. Tap "Begin your first session"
3. Speak: *"I've been feeling really anxious about my presentation tomorrow"*
4. Watch: transcription appears → coach responds with a reflective question → spoken aloud
5. Reply: *"I guess I'm scared people will think I'm not qualified"*
6. Coach gently names the emotion and asks a follow-up
7. Tap "End session" → LLM generates title, mood score, summary
8. Back on history screen: see the session card with mood label and score bar
9. Tap the session → full transcript view

**Key demo talking points:**
- Open DevTools → Network tab → **zero API calls during inference**
- Everything is in IndexedDB — open Application → IndexedDB → mindmirror
- Works in Airplane mode after first model download

---

## Privacy Guarantee

All AI inference runs inside WebAssembly in your browser tab.
No audio, no text, no session data ever leaves your device.
Models are downloaded once from HuggingFace and stored in browser OPFS.
There is no backend server. There is no database. There are no API keys.

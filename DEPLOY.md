# Deployment guide — Voice AI (premium stack)

The project ships as two independent deployments. Each is free and gives a
permanent URL.

```
voice-ai-screening.vercel.app   ←  Next.js front-end (premium UI)
        │
        │  HTTPS POST /api/analyse
        ▼
voice-ai-screening.hf.space     ←  FastAPI back-end (HuBERT + Praat + Whisper)
```

---

## 1 · Back-end → Hugging Face Spaces

Hugging Face gives a free 2 vCPU / 16 GB-RAM Docker container — ideal for the
HuBERT-base + Whisper-tiny + parselmouth stack.

1. **Create the Space** at <https://huggingface.co/new-space>:
   - **Owner**: your HF username
   - **Space name**: `voice-ai-screening`
   - **License**: MIT
   - **SDK**: **Docker** (important — the `Dockerfile` in `api/` is read directly)
   - **Hardware**: CPU basic (free) — fine for this workload

2. **Push the back-end** (from the project root):
   ```bash
   # Make sure git-lfs is installed once on your machine
   brew install git-lfs && git lfs install

   # Add the Space as a second remote
   git remote add hf https://huggingface.co/spaces/YOUR_USER/voice-ai-screening

   # Push everything (model_v2/, voice_ai/, voice_ai_v2/, api/) to HF
   git push hf main
   ```

3. **Wait ~5 min** for the first Docker build (HuBERT + Whisper download on
   first analysis, then cached). You'll get a permanent URL like:
   ```
   https://YOUR_USER-voice-ai-screening.hf.space
   ```

4. **Verify**:
   ```bash
   curl https://YOUR_USER-voice-ai-screening.hf.space/api/health
   # → {"ok": true, "model_loaded": true, "labels": [...]}
   ```

---

## 2 · Front-end → Vercel

1. **Sign in** to <https://vercel.com> with the same GitHub account.

2. **Import the project**:
   - Click **Add New → Project**
   - Pick `TuffHell/voice-ai-screening`
   - **Root directory**: `web` *(the Next.js app lives in `web/`)*
   - Framework preset: **Next.js** (auto-detected)

3. **Environment variable** — point the front-end at the HF back-end:
   ```
   Name:  NEXT_PUBLIC_API_URL
   Value: https://YOUR_USER-voice-ai-screening.hf.space
   ```

4. **Deploy**. Vercel gives you a permanent URL:
   ```
   https://voice-ai-screening.vercel.app
   ```

   Every push to `main` auto-rebuilds the site.

---

## Local development

```bash
# Terminal 1 — back-end
pip install -r api/requirements.txt
uvicorn api.app:app --reload --port 7860

# Terminal 2 — front-end
cd web && npm install && npm run dev
# Open http://localhost:3000
```

---

## Why this stack

| Concern | Old (Streamlit Cloud) | New |
|---|---|---|
| RAM | 1 GB (HuBERT OOMs) | 16 GB on HF Spaces |
| UI freedom | Locked to Streamlit DOM | Full React + GSAP/Framer Motion |
| Cold-boot speed | Slow (single big container) | Fast Vercel edge + warm HF Space |
| Animations | CSS hacks fighting the framework | Native to the framework |
| Cost | Free | Free × 2 |

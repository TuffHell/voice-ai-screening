---
title: Voice AI Backend
emoji: 🎙
colorFrom: blue
colorTo: indigo
sdk: docker
pinned: false
license: mit
short_description: Clinical voice-disorder screening API (HuBERT + Praat + ASR)
---

# Voice AI — Inference API

FastAPI service wrapping the HuBERT + Praat + Whisper clinical screening
pipeline. Backend for the Next.js frontend deployed on Vercel.

## Endpoints

- `GET  /` — service info
- `GET  /api/health` — health check + label list
- `POST /api/analyse` — multipart `audio` file → JSON analysis

Designed to run on Hugging Face Spaces (free CPU tier, 16 GB RAM).

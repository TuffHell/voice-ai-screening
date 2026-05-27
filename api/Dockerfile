FROM python:3.11-slim

# System libs needed for librosa / parselmouth / soundfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg libsndfile1 build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first (better Docker layer caching)
COPY api/requirements.txt /app/api/requirements.txt
RUN pip install --no-cache-dir -r /app/api/requirements.txt

# Copy the project (model_v2, voice_ai, voice_ai_v2, api)
COPY model_v2/    /app/model_v2/
COPY voice_ai/    /app/voice_ai/
COPY voice_ai_v2/ /app/voice_ai_v2/
COPY api/         /app/api/

ENV HF_HOME=/tmp/.cache/huggingface \
    TRANSFORMERS_CACHE=/tmp/.cache/huggingface \
    PYTHONUNBUFFERED=1

EXPOSE 7860
CMD ["uvicorn", "api.app:app", "--host", "0.0.0.0", "--port", "7860"]

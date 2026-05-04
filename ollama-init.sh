#!/bin/bash
set -e

echo '[Ollama Init] Starting Ollama server in background...'
ollama serve &
OLLAMA_PID=$!

echo '[Ollama Init] Waiting for Ollama to be ready (max 30s)...'
for i in {1..30}; do
  if ollama list > /dev/null 2>&1; then
    echo '[Ollama Init] Ollama is ready'
    break
  fi
  echo "[Ollama Init] Waiting... ($i/30)"
  sleep 1
done

echo '[Ollama Init] Checking for mistral model...'
if ollama list | grep -q mistral; then
  echo '[Ollama Init] Mistral model already present'
else
  echo '[Ollama Init] Pulling mistral model (this may take 15-30 minutes)...'
  ollama pull mistral
  echo '[Ollama Init] Mistral model pull complete'
fi

echo '[Ollama Init] Available models:'
ollama list

echo '[Ollama Init] Ready for queries'
wait $OLLAMA_PID

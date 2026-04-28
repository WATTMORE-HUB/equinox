#!/bin/bash

set -e

echo "[INFO] Starting ollama model downloader..."
echo "[INFO] This will download the Mistral model (~4GB)"
echo ""

# Start docker-compose
echo "[INFO] Starting ollama container..."
docker-compose up -d

# Wait for ollama to be ready
echo "[INFO] Waiting for ollama to be ready..."
for i in {1..60}; do
  if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "[OK] Ollama is ready"
    break
  fi
  echo "[WAIT] Waiting... ($i/60)"
  sleep 2
done

# Pull the model
echo "[INFO] Pulling Mistral model (this may take 10-20 minutes)..."
docker exec ollama-downloader ollama pull mistral

echo ""
echo "[OK] Model download complete!"
echo "[INFO] Model is stored in: ./ollama_data/"
echo "[INFO] To copy to device:"
echo "  tar -czf ollama_data.tar.gz ollama_data/"
echo "  scp ollama_data.tar.gz root@device:/root/.ollama"
echo ""
echo "[INFO] Keeping ollama running on http://localhost:11434"
echo "[INFO] Press Ctrl+C to stop"

# Keep container running
docker-compose logs -f

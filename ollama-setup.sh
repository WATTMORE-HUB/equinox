#!/bin/bash
# Ollama Model Setup Script
# Downloads pre-built TinyLlama model from S3 and configures Ollama
# This runs as the Ollama container entrypoint

set -e

S3_BUCKET="${S3_BUCKET:-enform-deployment-archives-211125775433}"
S3_MODEL_PATH="models/tinyllama"
OLLAMA_MODELS_DIR="${OLLAMA_MODELS_DIR:-/root/.ollama/models}"
AWS_REGION="${AWS_REGION:-us-east-2}"

echo "[Ollama Setup] Starting TinyLlama setup from S3..."
echo "[Ollama Setup] S3 Bucket: $S3_BUCKET"
echo "[Ollama Setup] Models directory: $OLLAMA_MODELS_DIR"

# Create models directory if it doesn't exist
mkdir -p "$OLLAMA_MODELS_DIR/blobs"
mkdir -p "$OLLAMA_MODELS_DIR/manifests"

# Check if model is already present
if [ -d "$OLLAMA_MODELS_DIR/blobs" ] && [ "$(ls -A $OLLAMA_MODELS_DIR/blobs)" ]; then
  echo "[Ollama Setup] Model files already present locally, skipping S3 download"
else
  echo "[Ollama Setup] Downloading TinyLlama model files from S3..."
  
  # Download blobs
  echo "[Ollama Setup] Downloading blobs..."
  aws s3 sync "s3://$S3_BUCKET/$S3_MODEL_PATH/blobs/" "$OLLAMA_MODELS_DIR/blobs/" \
    --region "$AWS_REGION" \
    --no-progress 2>&1 | grep -E "(download|Completed)" || true
  
  # Download manifests
  echo "[Ollama Setup] Downloading manifests..."
  aws s3 sync "s3://$S3_BUCKET/$S3_MODEL_PATH/manifests/" "$OLLAMA_MODELS_DIR/manifests/" \
    --region "$AWS_REGION" \
    --no-progress 2>&1 | grep -E "(download|Completed)" || true
  
  echo "[Ollama Setup] Model files downloaded successfully"
fi

# Verify model structure
BLOB_COUNT=$(find "$OLLAMA_MODELS_DIR/blobs" -type f 2>/dev/null | wc -l)
MANIFEST_COUNT=$(find "$OLLAMA_MODELS_DIR/manifests" -type f 2>/dev/null | wc -l)

echo "[Ollama Setup] Verification: $BLOB_COUNT blobs, $MANIFEST_COUNT manifests"

if [ "$BLOB_COUNT" -lt 1 ] || [ "$MANIFEST_COUNT" -lt 1 ]; then
  echo "[Ollama Setup] WARNING: Model files may be incomplete"
  echo "[Ollama Setup] Blobs: $BLOB_COUNT, Manifests: $MANIFEST_COUNT"
fi

# Start Ollama
echo "[Ollama Setup] Starting Ollama service..."
exec /usr/bin/ollama serve

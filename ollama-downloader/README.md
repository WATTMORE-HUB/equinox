# Ollama Model Downloader

Download the Mistral LLM model locally and prepare it for deployment to Balena devices.

## Usage

```bash
cd ollama-downloader
./pull-model.sh
```

This script will:
1. Start a standalone ollama container
2. Wait for it to be ready
3. Download the Mistral model (~4GB)
4. Display where the model is stored
5. Keep ollama running so you can test it

## What gets downloaded

The Mistral model will be stored in `./ollama_data/` which mirrors the volume in `docker-compose.yml`.

## Testing the model locally

Once the script completes, test the model:

```bash
curl -X POST http://localhost:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mistral",
    "prompt": "What is 2 + 2?",
    "stream": false
  }'
```

## Deploying to device

Once download is complete:

1. Stop the script (Ctrl+C)
2. Archive the model:
   ```bash
   tar -czf ollama_data.tar.gz ollama_data/
   ```
3. Copy to device:
   ```bash
   scp ollama_data.tar.gz root@<device>:/root/.ollama/
   ```
4. SSH to device and extract:
   ```bash
   ssh root@<device>
   cd /root/.ollama
   tar -xzf ollama_data.tar.gz
   ```

## Cleanup

To stop and remove the local container:

```bash
docker-compose down
```

The `ollama_data/` directory persists and can be reused.

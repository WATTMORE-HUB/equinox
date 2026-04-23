# Equinox Edge AI Setup Guide

## Overview
Equinox Phase B adds on-device AI-powered monitoring and chat interface to EnFORM deployments. After initial configuration, the dashboard transitions to monitor mode with a lightweight chat interface for system queries.

## Components

### 1. Monitor Service (Python)
- **Location**: `src/services/monitor.py`
- **Dockerfile**: `src/services/monitor.Dockerfile`
- **Runs**: Background polling of Docker containers and logs
- **Interval**: Configurable via `MONITORING_INTERVAL` env var (default: 300 seconds / 5 minutes)
- **Output**: JSON cache at `/collect_data/monitoring_cache.json`

### 2. LLM Client (Python)
- **Location**: `src/services/llm_client.py`
- **Model**: Uses ollama with lightweight model (phi, ggml-tiny recommended)
- **Endpoint**: `http://ollama:11434` (internal)
- **Fallback**: If ollama unavailable, uses intelligent rule-based responses
- **Query Timeout**: 30 seconds

### 3. Chat API (Node.js)
- **Endpoint**: `POST /api/chat`
- **Payload**: `{ "question": "string" }`
- **Response**: `{ "answer": "string" }`
- **Timeout**: 35 seconds (accounts for network + LLM latency)

### 4. Dashboard (HTML/JavaScript)
- **Mode Detection**: Auto-detects if device is configured; shows chat if yes, configuration if no
- **Location**: `public/dashboard.html`
- **Aesthetics**: Pulsing blue light, frosted glass panels (cinematic UI)
- **Session History**: Chat history persists in browser memory (lost on refresh)

## Deployment Configuration

### Environment Variables

#### Monitor Service
```bash
MONITORING_INTERVAL=300              # Seconds between polls (default: 5 min)
EQUINOX_MODE=monitor                 # Only in production docker-compose
IOT_PUBLISH_ENABLED=false             # Enable AWS IoT Core publishing (optional)
IOT_TOPIC=operate/device_reports      # Base topic for publishing
```

#### AWS IoT Core (Optional)
```bash
AWSENDPOINT=<your-iot-endpoint>      # AWS IoT endpoint URL
THINGNAME=<device-id>                # Device thing name
CERT_NAME=device.crt                 # Certificate filename
CERT=<pem-content>                   # Certificate content
KEY_NAME=private.key                 # Private key filename
KEY=<pem-content>                    # Private key content
CA_1_NAME=ca.crt                     # CA certificate filename
CA_1=<pem-content>                   # CA certificate content
SITE=<site-id>                       # Site identifier
EDGE_ID=<edge-id>                    # Edge device ID
BALENA_DEVICE_UUID=<uuid>            # Balena device UUID
```

### Docker Compose (Production)

See `docker-compose.prod.yml` for the standard setup:

```yaml
services:
  equinox:
    # Main dashboard/API server
    environment:
      - EQUINOX_MODE=monitor
    depends_on:
      - monitor
      - ollama
  
  monitor:
    # Background monitoring service
    build:
      dockerfile: src/services/monitor.Dockerfile
    environment:
      - MONITORING_INTERVAL=300
  
  ollama:
    # LLM inference engine
    image: ollama/ollama:latest
    environment:
      - OLLAMA_HOST=0.0.0.0:11434
    volumes:
      - ollama_data:/root/.ollama
```

## LLM Model Selection

### Recommended Models (by device)

| Device | Model | RAM | Response Time |
|--------|-------|-----|----------------|
| Raspberry Pi CM4 | phi | ~1.5GB | <2s |
| Raspberry Pi CM4 | ggml-tiny | ~0.8GB | <1s |
| Generic x86 | mistral | ~4GB | <1s |

### Model Installation (inside ollama container)

```bash
# Pull model once on startup
docker exec equinox-ollama ollama pull phi

# Or via curl
curl -X POST http://ollama:11434/api/pull -d '{"name": "phi"}'
```

## Memory and Performance Tuning

### Monitor Service
- **Baseline**: ~50MB resident memory
- **Per Container**: ~5-10MB tracking overhead
- **Polling Impact**: <1% CPU during checks, <5% during analysis

### Ollama + LLM
- **Cold Start**: 2-3 seconds (model load)
- **Warm Response**: <1-2 seconds typical
- **Memory**: 0.8-1.5GB depending on model

### Tips for Resource-Constrained Devices
1. Use `phi` or `ggml-tiny` models (not full mistral)
2. Increase `MONITORING_INTERVAL` to 600s (10 min) if CPU pressure
3. Reduce log file scanning depth (modify `analyze_logs()`)
4. Disable IoT publishing if network is slow (`IOT_PUBLISH_ENABLED=false`)

## Testing the Setup

### Manual Testing Checklist

**1. Monitor Service Running**
```bash
docker ps | grep equinox-monitor
docker logs equinox-monitor | tail -20
```

**2. Monitor Cache Updated**
```bash
cat /collect_data/monitoring_cache.json | jq .
# Should show containers, last_updated timestamp
```

**3. Chat API Responding**
```bash
curl -X POST http://localhost/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "How many containers are running?"}'
# Should return: {"answer": "..."}
```

**4. Dashboard Loading**
- Open `http://<device-ip>/` in browser
- Should show chat interface if configured
- Ask test questions about container health

**5. LLM Integration (if ollama enabled)**
```bash
docker logs equinox-ollama | grep -i "loaded"
# Verify model is loaded
```

## Troubleshooting

### Monitor not collecting data
- Check `/collect_data` directory exists and is writable
- Verify Docker socket is mounted: `ls -l /var/run/docker.sock`
- Review `docker logs equinox-monitor`

### Chat returning "Unable to process"
- Check monitoring cache exists: `ls -la /collect_data/monitoring_cache.json`
- Verify Node.js llmClientNode.js can read cache
- Try direct curl to `/api/chat` endpoint

### Slow responses (>5 seconds)
- Check if ollama model is loaded: `docker logs equinox-ollama`
- Increase timeout if device is under load (modify `chat.js`)
- Consider lighter model (ggml-tiny instead of phi)

### AWS IoT Core publishing failing
- Verify certs are created: `ls -l /collect_data/{device.crt,private.key,ca.crt}`
- Check network connectivity to AWS endpoint
- Verify `IOT_PUBLISH_ENABLED=true` in env

## Advanced Configuration

### Custom Error Patterns
Edit `src/services/monitor.py` `analyze_logs()` to detect domain-specific errors:

```python
if 'custom_error_keyword' in line.lower():
    errors.append(f"{log_file.name}: {line.strip()[:100]}")
```

### Custom Monitoring Interval per Service
Modify `_should_monitor()` in monitor service to filter by service name and apply different intervals.

### Persistent Chat History
To save chat history across sessions, modify `dashboard.html` to POST to a new `/api/chat-history` endpoint that persists to `/collect_data/chat_history.json`.

## See Also
- [MONITORING.md](./MONITORING.md) - Monitoring service details
- [CHAT_INTERFACE.md](./CHAT_INTERFACE.md) - Chat UI user guide

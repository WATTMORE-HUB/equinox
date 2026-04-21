# Deployment Guide for LLM System to CM4

This guide walks through deploying the LLM deployment manager to your balenaOS device.

## Prerequisites

- Device running balenaOS (enrolled in your balena fleet)
- Balena CLI installed (`balena login` must work)
- Project pushed to device at least once (for initial directory structure)

## Quick Start

### Option 1: Standalone Deployment (Recommended for Testing)

If you want to test the LLM system in isolation first:

```bash
cd /Volumes/Macintosh\ HD/Users/drb/Documents/Enform/src/tools/llm_deployment

# Create a new balena app (if not already created)
balena app create llm-deployment --type=cm4

# Set your device as the deploy target
balena device select

# Build and push to device
balena push <device-name-or-ip>
```

The LLM system will be available at `http://<device-ip>:3000`

### Option 2: Integrate into Existing Fleet

If you already have a device with services running:

1. Copy the llm-deployment service into your fleet's docker-compose.yml:

```yaml
services:
  llm-deployment:
    build: ./src/tools/llm_deployment
    container_name: llm-deployment
    restart: always
    ports:
      - "3000:3000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - collect_data:/collect_data
    environment:
      - PORT=3000
      - STATE_FILE_PATH=/collect_data/state.json
      - COLLECT_DATA_PATH=/collect_data
```

2. Push to your device:

```bash
balena push <device-name>
```

## Accessing the System

### Web Dashboard

Once deployed, access the dashboard at:

```
http://<device-ip>:3000
```

### API Health Check

```bash
curl http://<device-ip>:3000/health
```

### Status Endpoints

```bash
# Get all deployments
curl http://<device-ip>:3000/api/status/deployments

# Get full state (debugging)
curl http://<device-ip>:3000/api/status/state
```

## Verifying Deployment

### Via Balena Dashboard

1. Go to https://dashboard.balena-cloud.com
2. Select your device
3. Check the LLM container is running (status: "Running")
4. View logs for the container

### Via Device Terminal

SSH into your device:

```bash
balena ssh <device-uuid>
```

Check the container:

```bash
# List running containers
docker ps | grep llm

# View logs
docker logs llm-deployment -f
```

## State File Location

The state file is stored at `/collect_data/state.json` on the device.

To inspect it:

```bash
balena ssh <device-uuid>
# Then:
cat /collect_data/state.json | jq '.'
```

## Troubleshooting

### Container won't start

Check logs:

```bash
balena logs <device-uuid> llm-deployment
```

Common issues:
- Docker socket not mounted: ensure `/var/run/docker.sock` is in volumes
- State file permissions: collect_data volume must be writable

### Can't access dashboard

1. Verify device IP is correct and device is online
2. Check port 3000 is exposed: `balena port publish <device-uuid> 3000:3000`
3. Check container is running: `balena ssh <device-uuid> && docker ps`

### State file not persisting

Ensure the `collect_data` volume is properly mounted:

```bash
balena ssh <device-uuid>
docker inspect llm-deployment | grep -A 5 Mounts
```

## Testing Locally Before Deployment

Run the test suite first:

```bash
cd /Volumes/Macintosh\ HD/Users/drb/Documents/Enform/src/tools/llm_deployment
npm test
```

## Next Steps

1. Deploy to your lab device
2. Access dashboard and verify it's running
3. Test a deployment by uploading a CSV with services
4. Check that state.json records the deployment
5. Monitor logs for any errors
6. Proceed to Phase 2 for full integration testing

## Environment Variables (Device)

Configure in docker-compose.yml or via balena dashboard:

- `PORT`: Server port (default: 3000)
- `STATE_FILE_PATH`: State file location (default: `/collect_data/state.json`)
- `COLLECT_DATA_PATH`: Data volume path (default: `/collect_data`)
- `LOG_CHECK_INTERVAL`: Milliseconds between log checks (default: 3600000 = 1 hour)
- `VALIDATION_WINDOW`: Milliseconds for data validation (default: 600000 = 10 minutes)

## Rollback

If something breaks, you can quickly rollback:

```bash
balena release rollback <device-uuid>
```

## Notes

- The system will auto-create `state.json` on first run
- Logs are stored in state.json errorLog array, not in Docker logs
- Background schedulers start automatically (no manual trigger needed)
- The web UI refreshes status every 5 seconds

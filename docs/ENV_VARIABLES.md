# Environment Variables Troubleshooting

## Problem: Environment Variables Not Loading

When you restart Equinox (especially from an older installation), environment variables may not populate. This guide explains how environment variables are loaded and how to fix issues.

## How Variables Are Loaded

### Development (Local)
1. `.env` file in project root (created from `.env.example`)
2. Automatically loaded by `dotenv` package in `src/server.js`

### Production/Docker
1. Variables passed directly to container via docker-compose or Balena
2. Available immediately in `process.env` (Node.js) or `os.environ` (Python)
3. `.env` file is **not used** (it doesn't exist in container)

## Checking Your Setup

### 1. Verify Environment Variables Are Set
```bash
# On the device, check if monitor service has env vars:
docker inspect equinox-monitor | grep -A 20 "Env"

# Should show:
# "MONITORING_INTERVAL=300",
# etc.
```

### 2. Check Docker Compose Configuration
```bash
# Verify docker-compose.prod.yml has variables:
cat docker-compose.prod.yml | grep -A 5 "environment:"

# Should show environment section for each service
```

### 3. View Running Container Environment
```bash
# List all env vars in equinox container:
docker exec equinox env

# List all env vars in monitor container:
docker exec equinox-monitor env
```

## Common Issues & Fixes

### Issue 1: Running Old docker-compose.yml Instead of docker-compose.prod.yml

**Symptom**: Monitor service not starting, or wrong env vars

**Fix**:
```bash
# Stop containers:
docker-compose down

# Run production compose file:
docker-compose -f docker-compose.prod.yml up -d

# Verify:
docker ps | grep equinox
```

### Issue 2: EQUINOX_MODE Still Set to "configure"

**Symptom**: Dashboard shows configuration form instead of chat interface

**Fix**:
```bash
# In docker-compose.prod.yml, equinox service should have:
environment:
  - EQUINOX_MODE=monitor

# Rebuild and restart:
docker-compose -f docker-compose.prod.yml up -d --force-recreate equinox
```

### Issue 3: Variables Present but Node.js Can't Access Them

**Root Cause**: `dotenv.config()` in server.js tries to load `.env` file first. In Docker, use env vars directly.

**Verify**:
```bash
# Inside container, check if variables are accessible:
docker exec equinox node -e "console.log(process.env.PORT)"
docker exec equinox node -e "console.log(process.env.EQUINOX_MODE)"

# Should output the values, not blank
```

**Fix**: Ensure variables are passed to container in docker-compose:
```yaml
services:
  equinox:
    environment:
      - PORT=80
      - NODE_ENV=production
      - EQUINOX_MODE=monitor  # <-- This one is critical for chat mode
```

### Issue 4: AWS IoT Variables Missing

**Symptom**: Monitor logs show "IoT Core publishing disabled" even though you want it enabled

**Fix**:
```bash
# Verify IOT_PUBLISH_ENABLED=true in docker-compose:
grep -A 15 "monitor:" docker-compose.prod.yml | grep IOT_PUBLISH_ENABLED

# Should see: IOT_PUBLISH_ENABLED=true

# If missing, add to docker-compose.prod.yml:
monitor:
  environment:
    - IOT_PUBLISH_ENABLED=true
    - AWSENDPOINT=<your-aws-endpoint>
    - THINGNAME=<device-id>
    # ... other cert/key vars
```

## Quick Checklist Before Deployment

### For Configuration Mode (Initial Setup)
```bash
# Use regular docker-compose.yml
docker-compose -f docker-compose.yml up -d

# Verify EQUINOX_MODE is NOT set (defaults to 'configure')
docker exec equinox node -e "console.log(process.env.EQUINOX_MODE)"
# Should output: "undefined" or be missing
```

### For Monitor Mode (After Setup)
```bash
# Use docker-compose.prod.yml
docker-compose -f docker-compose.prod.yml up -d

# Verify critical variables:
docker exec equinox node -e "console.log('MODE:', process.env.EQUINOX_MODE)"
# Should output: "MODE: monitor"

docker exec equinox-monitor python -c "import os; print('INTERVAL:', os.getenv('MONITORING_INTERVAL'))"
# Should output: "INTERVAL: 300" (or your custom value)
```

## Environment Variables Reference

### Node.js Server
- `PORT` — Server port (default: 80)
- `NODE_ENV` — Environment (production/development)
- `EQUINOX_MODE` — "configure" or "monitor"
- `STATE_FILE_PATH` — Where state is stored
- `BALENA_API_TOKEN` — For deployment features (if using cloud)

### Python Monitor Service
- `MONITORING_INTERVAL` — Polling interval in seconds (default: 300)
- `IOT_PUBLISH_ENABLED` — "true" or "false"
- `AWSENDPOINT` — AWS IoT endpoint (if IoT enabled)
- `THINGNAME` — AWS IoT thing name
- `CERT`, `KEY`, `CA_1` — Certificate contents
- `CERT_NAME`, `KEY_NAME`, `CA_1_NAME` — Filenames

## Docker Environment Inheritance

**Important**: Environment variables set in docker-compose are inherited by the container and available to child processes:

```yaml
# docker-compose.prod.yml
services:
  equinox:
    environment:
      - MY_VAR=hello
    # This is passed to container, available as process.env.MY_VAR (Node) or os.getenv('MY_VAR') (Python)
```

Variables are **not** read from `.env` file inside Docker — they must be passed via:
1. `docker-compose.yml` (via `environment:` or `env_file:`)
2. `docker run -e VAR=value` command
3. Balena dashboard (Balena environment variables)

## Debugging Steps

### 1. Check Docker Compose File Syntax
```bash
docker-compose -f docker-compose.prod.yml config
# Should output valid YAML, no errors
```

### 2. Check Container Startup Logs
```bash
docker logs equinox | head -20
docker logs equinox-monitor | head -20
```

### 3. Print All Environment Variables
```bash
# Node.js server:
docker exec equinox node -e "console.log(JSON.stringify(process.env, null, 2))"

# Python monitor:
docker exec equinox-monitor python -c "import os; print('\n'.join([f'{k}={v}' for k,v in sorted(os.environ.items())]))"
```

### 4. Verify Specific Variable
```bash
docker exec equinox-monitor python -c "import os; print(os.getenv('MONITORING_INTERVAL', 'NOT SET'))"
```

## See Also
- `.env.example` — Template with all available variables
- `docker-compose.yml` — Configuration mode setup
- `docker-compose.prod.yml` — Monitor mode setup
- [EDGE_AI_SETUP.md](./EDGE_AI_SETUP.md) — Full setup guide

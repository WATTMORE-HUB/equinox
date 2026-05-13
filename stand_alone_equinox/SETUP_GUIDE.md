# Equinox Standalone Setup Guide

This guide covers adding Equinox to existing Balena projects.

## Quick Setup

1. Copy the `stand_alone_equinox` directory contents into your Balena project root
2. Merge the `docker-compose.yml` with your existing file (add the `equinox` service)
3. Set environment variables on your device (see below)
4. Push to device: `balena push <device-name-or-ip>`

## Directory Structure

```
your-balena-project/
├── src/                          # Equinox application code
├── public/                        # Frontend dashboard (dashboard.html)
├── configurator/                  # Deployment configuration system
├── Dockerfile                     # Equinox container build
├── package.json                   # Node dependencies
├── docker-compose.yml             # Merge the equinox service into your existing file
└── SETUP_GUIDE.md                 # This file
```

## No Configuration Needed

**The provided `docker-compose.yml` already includes all credentials and configuration.** It will work as-is when deployed to your older Balena devices, just like it does on OfficeLab.

All necessary environment variables are pre-configured:
- `BALENA_API_TOKEN` — Balena API token (already set)
- `EQUINOX_TOKEN_BUCKET` — S3 bucket name (already set)
- `EQUINOX_TOKEN_KEY` — S3 object key (already set)
- `CLOUD_API_URL` — Lambda/EC2 deployment endpoint (already set)

**Token Loading Priority:**
Equinox loads the token in this order:
1. Direct env var: `BALENA_API_TOKEN`
2. S3 bucket: `EQUINOX_TOKEN_BUCKET` + `EQUINOX_TOKEN_KEY` (requires AWS credentials)
3. Local config file: `/collect_data/balena-token.json`

With the provided `docker-compose.yml`, option 1 and 2 are already configured and will work immediately.

---

## Environment Variables Reference

### Server Configuration

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `PORT` | `80` | Server port (use 80 for Balena tunnel access) |
| `NODE_ENV` | `production` | Node environment (production / development) |
| `EQUINOX_MODE` | `configure` | Mode: "configure" (deployment) or "monitor" (monitoring) |

### Data Paths

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `STATE_FILE_PATH` | `/collect_data/state.json` | Path to persistent state file (survives restarts) |
| `COLLECT_DATA_PATH` | `/collect_data` | Volume mount path for collected data/JSON files |
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Docker socket for container log access |

### Log Analysis & Validation (Monitor Mode)

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `LOG_CHECK_INTERVAL` | `3600000` | Log analysis interval in milliseconds (1 hour = 3600000) |
| `VALIDATION_WINDOW` | `600000` | Data validation window in milliseconds (10 min = 600000) |
| `MONITORING_INTERVAL` | `300` | Monitor service polling interval in seconds |

### Cloud Deployment

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `USE_CLOUD` | `true` | Enable cloud deployments via Lambda/EC2 |
| `CLOUD_API_URL` | (set in docker-compose.yml) | API Gateway endpoint for cloud deployments |

### AWS IoT Core (Optional)

Use these only if publishing device metrics to AWS IoT Core.

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `IOT_PUBLISH_ENABLED` | `false` | Enable AWS IoT Core publishing (true/false) |
| `AWSENDPOINT` | (empty) | AWS IoT endpoint URL (e.g., `xxx.iot.us-east-1.amazonaws.com`) |
| `THINGNAME` | (empty) | Device thing name in AWS IoT |
| `CERT` | (empty) | Device certificate (PEM format, full content) |
| `KEY` | (empty) | Private key (PEM format, full content) |
| `CA_1` | (empty) | CA certificate (PEM format, full content) |
| `CERT_NAME` | `device.crt` | Certificate filename |
| `KEY_NAME` | `private.key` | Private key filename |
| `CA_1_NAME` | `ca.crt` | CA certificate filename |
| `IOT_TOPIC` | `operate/device_reports` | Base topic for publishing |

### Device Identification

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `SITE` | (empty) | Site/location identifier for your device |
| `EDGE_ID` | (empty) | Edge device ID (optional identifier) |
| `BALENA_DEVICE_UUID` | (empty) | Balena device UUID (set automatically by Balena) |

---

## Merging docker-compose.yml

If your project already has a `docker-compose.yml`, merge the `equinox` service into it:

**Before (your existing file):**
```yaml
version: '2'

services:
  myservice:
    build: .
    # ... your service config
```

**After (add equinox):**
```yaml
version: '2'

services:
  myservice:
    build: .
    # ... your service config

  equinox:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: equinox
    restart: always
    ports:
      - "80:80"
    # ... rest of equinox config from docker-compose.yml
```

---

## Setting Environment Variables on Device

### Method 1: Balena Dashboard (Recommended)

1. Go to https://dashboard.balena-cloud.com/
2. Select your device
3. Go to **Device Configuration** → **Device Environment Variables**
4. Add variables (e.g., `BALENA_API_TOKEN`)
5. Changes apply after next restart or within a few minutes

### Method 2: balena CLI

```bash
# Set single variable
balena env add BALENA_API_TOKEN your_token_here -d device-name

# Set multiple variables
balena env add LOG_CHECK_INTERVAL 3600000 -d device-name
balena env add MONITORING_INTERVAL 300 -d device-name
```

### Method 3: Direct SSH

```bash
# SSH into device
balena ssh device-name

# Edit environment variables (once inside device)
vi /etc/balena-env.d/equinox.env  # or appropriate file
```

---

## Startup Verification

After deploying, verify Equinox is running:

```bash
# Check health endpoint
curl http://<device-ip>/health

# View deployment status
curl http://<device-ip>/api/status/deployments

# Check container logs
balena logs device-name equinox
```

**Expected output from `/health`:**
```json
{"status":"ok"}
```

---

## Configuration Mode vs Monitor Mode

### Configuration Mode (default: `EQUINOX_MODE=configure`)
- Displays dashboard for initial device setup
- Allows deployment of services to other devices
- Requires `BALENA_API_TOKEN`
- Used when first bringing up a device

### Monitor Mode (`EQUINOX_MODE=monitor`)
- Provides chat interface for system monitoring
- Analyzes container logs hourly
- Validates JSON data every 30 seconds
- Uses Python monitoring service (docker-compose.prod.yml)

To switch to Monitor Mode after initial setup:
```
EQUINOX_MODE = monitor
```

---

## Troubleshooting

### Issue: "Cannot connect to Docker daemon"
**Solution:** Docker socket must be mounted. Ensure your docker-compose.yml includes:
```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock:ro
```

### Issue: Dashboard doesn't load
**Solution:** Check port 80 is accessible. Verify with `curl http://device-ip/health`

### Issue: Deployment fails
**Likely causes:**
- Missing `BALENA_API_TOKEN` - add to device environment variables
- Configurator directory missing - should be in `stand_alone_equinox/configurator/`
- Cloud API URL unreachable - check `CLOUD_API_URL` environment variable

### Issue: State file keeps resetting
**Solution:** Ensure `/collect_data` volume persists across restarts. Check docker-compose.yml has:
```yaml
volumes:
  collect_data:
    driver: local
```

---

## Advanced Configuration

### Custom Data Paths
If your project uses different volume mounts, adjust these variables:
```
STATE_FILE_PATH = /your-custom-path/state.json
COLLECT_DATA_PATH = /your-custom-path
```

### Monitoring Intervals
For high-frequency log analysis:
```
LOG_CHECK_INTERVAL = 300000      # 5 minutes instead of 1 hour
MONITORING_INTERVAL = 60         # 1 minute instead of 5 minutes
```

**Warning:** Lower intervals increase CPU usage.

### Disabling Cloud Deployments
If you only want local deployment:
```
USE_CLOUD = false
```

---

## Support

For issues or feature requests, refer to the main Equinox repository or documentation.

For Balena-specific help: https://www.balena.io/docs/

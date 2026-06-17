# Equinox Quick Start Guide

This template contains all files needed to add Equinox to any Balena project (that doesn't use EC2 deployment).

## What's Included

- `equinox_src/` - Equinox application source code
- `equinox_public/` - Static web assets (dashboard HTML, CSS, JS)
- `equinox_configurator/` - Service configuration generator
- `equinox_package.json` & `equinox_package-lock.json` - Node dependencies (locked versions)
- `equinox.Dockerfile` - Equinox container build definition
- `docker-compose.yml.example` - Example compose configuration

## How to Use

### 1. Copy Files to Your Project

```bash
# Copy all equinox files to your target Balena project directory
cp -r /path/to/equinox_template/* /path/to/your/balena/project/
```

### 2. Update Your docker-compose.yml

Add the equinox and monitor services to your existing `docker-compose.yml`:

```yaml
version: "2"

services:
  # Your existing services here...

  # Add Equinox deployment interface
  equinox:
    build:
      dockerfile: equinox.Dockerfile
      context: .
    restart: unless-stopped
    environment:
      - PORT=3000
      - NODE_ENV=production
      - EQUINOX_MODE=monitor
      - STATE_FILE_PATH=/collect_data/state.json
      - COLLECT_DATA_PATH=/collect_data
      - DOCKER_SOCKET=/var/run/docker.sock
      - LOG_CHECK_INTERVAL=3600000
      - VALIDATION_WINDOW=600000
      - IOT_PUBLISH_ENABLED=${IOT_PUBLISH_ENABLED:-true}
      - IOT_TOPIC=${IOT_TOPIC:-operate/device_reports}
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock:ro"
      - "collect_data:/collect_data"
    expose:
      - "3000"
    depends_on:
      - monitor
    privileged: true

  # Add Python monitor service for MQTT publishing
  monitor:
    build:
      dockerfile: equinox_src/services/monitor.Dockerfile
      context: .
    container_name: equinox-monitor
    restart: always
    environment:
      - MONITORING_INTERVAL=60
      - SYSTEM_REPORT_INTERVAL=60
      - PYTHONUNBUFFERED=1
      - IOT_PUBLISH_ENABLED=true
      - IOT_TOPIC=operate/device_reports
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock:ro"
      - "collect_data:/collect_data"
    privileged: true

volumes:
  collect_data:
```

### 3. Deploy to Balena

```bash
# From your project directory
balena push YOUR_DEVICE_NAME
```

## Configuration

### Environment Variables (Device-Level)

Set these in Balena Cloud dashboard under device environment variables:

- `IOT_PUBLISH_ENABLED` - Set to `true` to enable MQTT publishing
- `IOT_TOPIC` - MQTT topic root (default: `operate/device_reports`)
- `SITE_ID` - Site/device identifier (used in MQTT topics)
- `AWSENDPOINT` - AWS IoT Core endpoint
- `THINGNAME` - Device thing name in AWS IoT
- `CERT`, `KEY`, `CA_1` - Certificate contents (PEM format)

### Equinox Features

Once deployed, Equinox will:

1. **Config Mode** (if `EQUINOX_MODE=config`)
   - Display dashboard with Balena token/device ID input
   - Allow service deployment configuration

2. **Monitor Mode** (if `EQUINOX_MODE=monitor`)
   - Provide web interface for system monitoring
   - Display container logs and system metrics
   - Enable data validation checks
   - Publish system reports to AWS IoT Core every 60 seconds

## Accessing Equinox

- **Local**: http://device-ip:3000
- **Balena Tunnel**: `balena ssh YOUR_DEVICE_NAME` then http://localhost:3000

## Troubleshooting

- Check logs: `balena logs equinox`
- Monitor service logs: `balena logs equinox-monitor`
- Verify docker socket is mounted: `balena logs equinox | grep "docker.sock"`
- Check MQTT publishing: Look for "Publishing to AWS IoT" in equinox-monitor logs

## Key Differences from Other Deployments

- Uses `equinox_src/`, `equinox_public/`, `equinox_configurator/` directory naming to avoid conflicts with existing project structures
- Package files are named `equinox_package*.json` (not `package*.json`)
- Single Dockerfile (`equinox.Dockerfile`) handles the equinox service
- Monitor service uses `equinox_src/services/monitor.Dockerfile`

## Files Reference

| File | Purpose |
|------|---------|
| `equinox.Dockerfile` | Node.js container for Equinox app |
| `equinox_src/` | Equinox application code |
| `equinox_public/` | Static assets (HTML, CSS, JS) |
| `equinox_configurator/` | Service configuration generator |
| `equinox_package*.json` | Node dependencies |

## Notes

- Monitor service publishes system status every 60 seconds
- Timestream data validation window is 10 minutes by default
- Log analysis runs hourly (configurable via LOG_CHECK_INTERVAL)
- Monitor service ignores its own logs to prevent false error detection

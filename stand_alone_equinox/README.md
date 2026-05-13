# Equinox Standalone Package

This directory contains all files needed to add Equinox to an existing Balena project.

## What's Included

- **src/** — Complete Equinox application code (Node.js)
  - Routes (chat, deployment, status)
  - Services (intent matching, response formatting, log analysis, etc.)
  - State management and utilities
  
- **public/** — Frontend dashboard
  - Single-page application (dashboard.html)
  - Chat interface and deployment forms
  
- **configurator/** — Service deployment configuration system
  - Project creator for generating docker-compose from component blueprints
  - Service templates
  
- **Dockerfile** — Container image for Equinox
  - Node 18 Alpine base
  - Includes health check
  
- **package.json** — Node.js dependencies
  - Express, Docker client, AWS SDK, cron scheduling
  - Development: nodemon for hot reload
  
- **docker-compose.yml** — Orchestration for Equinox service
  - Already configured for Balena deployment
  - Mounts Docker socket and data volumes
  
- **SETUP_GUIDE.md** — Detailed setup instructions
  - Environment variable reference
  - Merging with existing docker-compose files
  - Troubleshooting guide

## Quick Start for Existing Projects

### 1. Copy Files
```bash
# Copy all contents of this directory into your Balena project root
cp -r stand_alone_equinox/* your-balena-project/
```

### 2. Merge docker-compose.yml
If you already have a `docker-compose.yml`, add the `equinox` service to it (don't replace it). See SETUP_GUIDE.md for details.

### 3. No Additional Setup Needed

All credentials are pre-configured in `docker-compose.yml`. It will work immediately.

### 4. Deploy
```bash
balena push your-device-name-or-ip
```

### 5. Verify
```bash
curl http://<device-ip>/health
# Should return: {"status":"ok"}
```

## Environment Variables

**Pre-configured in `docker-compose.yml`:**
- `BALENA_API_TOKEN` — Balena API token (already set)
- `EQUINOX_TOKEN_BUCKET` — S3 bucket name (already set)
- `EQUINOX_TOKEN_KEY` — S3 object key (already set)
- `CLOUD_API_URL` — Lambda/EC2 deployment endpoint (already set)

**No additional configuration needed.** The provided files work as-is, just like on OfficeLab.

See **SETUP_GUIDE.md** for optional customization and reference.

## Modes

### Configuration Mode (default)
- Shows dashboard for device setup
- Allows deploying services to other devices
- Required: BALENA_API_TOKEN

### Monitor Mode
- Chat interface for system monitoring
- Real-time container logs and metrics
- AWS IoT Core integration (optional)

Switch mode by setting: `EQUINOX_MODE=monitor`

## Port Usage

Equinox uses **port 80** for the web interface. Make sure this port isn't in use by other services.

## Volume Mounts

- `/var/run/docker.sock` — Docker daemon access (read-only)
- `/collect_data` — Persistent storage for state and collected data

These are already configured in `docker-compose.yml`.

## Troubleshooting

**Dashboard won't load?**
- Check port 80 is open: `curl http://device-ip/`
- Verify container is running: `balena logs device-name equinox`

**Deployment fails?**
- Ensure `BALENA_API_TOKEN` is set on device
- Check Docker socket is mounted properly

**State file keeps resetting?**
- Verify `/collect_data` volume persists in docker-compose.yml

See **SETUP_GUIDE.md** for more troubleshooting steps.

## Next Steps

1. Read **SETUP_GUIDE.md** for detailed configuration options
2. After deployment, access dashboard at: `http://<device-ip>/`
3. Set `BALENA_API_TOKEN` before attempting deployments
4. Monitor logs: `balena logs device-name equinox`

## File Size

This package is ~5 MB (excluding node_modules, which are installed during build).

## Support

For detailed setup instructions, environment variable reference, and troubleshooting, see **SETUP_GUIDE.md**.

For general Balena help: https://www.balena.io/docs/

# Equinox Integration Checklist

Use this checklist when adding Equinox to an existing Balena project.

## Pre-Integration

- [ ] Read `EQUINOX_QUICKSTART.md`
- [ ] Identify your project's base directory
- [ ] Verify you have read/write access to the project
- [ ] Back up your current `docker-compose.yml`

## File Copying

- [ ] Copy `equinox_src/` to project root
- [ ] Copy `equinox_public/` to project root
- [ ] Copy `equinox_configurator/` to project root
- [ ] Copy `equinox_package.json` to project root (keep the `equinox_` prefix)
- [ ] Copy `equinox_package-lock.json` to project root (keep the `equinox_` prefix)
- [ ] Copy `equinox.Dockerfile` to project root

## docker-compose.yml Updates

- [ ] Back up existing `docker-compose.yml`
- [ ] Open `docker-compose.yml` in editor
- [ ] Ensure version is at least `"2"` at the top
- [ ] Add `equinox:` service section with:
  - [ ] `build:` pointing to `equinox.Dockerfile`
  - [ ] Environment variables (PORT, NODE_ENV, EQUINOX_MODE, paths)
  - [ ] Volume mounts (docker socket, collect_data)
  - [ ] `depends_on: - monitor`
  - [ ] `privileged: true`
  - [ ] `expose: - "3000"`
- [ ] Add `monitor:` service section with:
  - [ ] `build:` pointing to `equinox_src/services/monitor.Dockerfile`
  - [ ] `container_name: equinox-monitor`
  - [ ] Environment variables (MONITORING_INTERVAL=60, IOT_PUBLISH_ENABLED=true, IOT_TOPIC)
  - [ ] Volume mounts (docker socket, collect_data)
  - [ ] `privileged: true`
  - [ ] `restart: always`
- [ ] Add `volumes:` section with:
  - [ ] `collect_data:` volume definition
- [ ] Optional: Add `networks:` section if your project uses custom networks
- [ ] Validate YAML syntax

## Balena Cloud Setup

- [ ] Log in to Balena Cloud dashboard
- [ ] Navigate to your device
- [ ] Go to Device Configuration → Environment Variables
- [ ] Add device-level environment variables:
  - [ ] `SITE_ID` = your device/site identifier
  - [ ] `IOT_PUBLISH_ENABLED` = `true`
  - [ ] `AWSENDPOINT` = your AWS IoT endpoint (if using MQTT)
  - [ ] `THINGNAME` = your AWS IoT thing name (if using MQTT)
  - [ ] AWS certificates if using MQTT:
    - [ ] `CERT` = certificate content
    - [ ] `KEY` = private key content
    - [ ] `CA_1` = CA certificate content

## Deployment

- [ ] Navigate to project directory in terminal
- [ ] Run: `balena push YOUR_DEVICE_NAME`
- [ ] Monitor build progress in terminal
- [ ] Wait for release to upload (usually 2-5 minutes)
- [ ] Device should begin downloading and deploying new containers

## Post-Deployment Verification

- [ ] Monitor build completion: `balena logs -n 100`
- [ ] Check equinox container is running: `balena ps`
- [ ] Verify equinox-monitor container is running: `balena ps`
- [ ] Access Equinox web interface:
  - [ ] Via local network: `http://DEVICE_IP:3000`
  - [ ] Via Balena tunnel: `balena ssh DEVICE_NAME`, then `http://localhost:3000`
- [ ] Check Equinox logs: `balena logs equinox -n 50`
- [ ] Check Monitor logs: `balena logs equinox-monitor -n 50`
- [ ] Verify docker socket is accessible: `balena logs equinox | grep "docker.sock"`
- [ ] Monitor mode enabled: `balena logs equinox | grep "EQUINOX_MODE"`

## MQTT Verification (if enabled)

- [ ] Monitor logs for MQTT connection: `balena logs equinox-monitor | grep -i mqtt`
- [ ] Look for "Publishing to AWS IoT" messages
- [ ] Check SITE_ID is being used in topic names
- [ ] Verify publishing interval (should be every 60 seconds)
- [ ] If using AWS Timestream, check for data writes to your table

## Troubleshooting

If deployment fails:
- [ ] Check build errors in terminal output
- [ ] Review `docker-compose.yml` YAML syntax
- [ ] Verify all file paths in compose file exist
- [ ] Ensure `equinox_src/services/monitor.Dockerfile` exists
- [ ] Check for typos in service names and dockerfile paths

If containers don't start:
- [ ] Check logs: `balena logs`
- [ ] Verify environment variables are set
- [ ] Check docker socket permissions: `balena exec equinox ls -la /var/run/docker.sock`
- [ ] Ensure `collect_data` volume is created: `balena logs | grep "collect_data"`

If MQTT publishing fails:
- [ ] Verify `IOT_PUBLISH_ENABLED=true` is set
- [ ] Check AWS credentials (CERT, KEY, CA_1)
- [ ] Verify AWSENDPOINT and THINGNAME match AWS IoT configuration
- [ ] Check monitor logs for connection errors: `balena logs equinox-monitor`

## Rollback

If needed, to revert:
- [ ] Restore your backed-up `docker-compose.yml`
- [ ] Remove Equinox files you copied
- [ ] Run: `balena push YOUR_DEVICE_NAME` with the original compose file

## Documentation

- See `EQUINOX_QUICKSTART.md` for more details
- See Equinox main README for architecture details
- Check `equinox_src/` for source code documentation

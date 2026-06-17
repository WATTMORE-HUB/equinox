# Equinox Template

This directory contains a complete, ready-to-use Equinox deployment template for integrating into non-EC2 Balena projects.

## Quick Start

1. Copy all files from this directory to your Balena project root:
   ```bash
   cp -r /path/to/equinox_template/* /path/to/your/balena/project/
   ```

2. Add equinox and monitor services to your `docker-compose.yml` (see `EQUINOX_QUICKSTART.md` for details)

3. Deploy to Balena:
   ```bash
   balena push YOUR_DEVICE_NAME
   ```

## What's Included

### Directories
- `equinox_src/` - Complete Equinox application source code with all services
- `equinox_public/` - Static web assets (HTML, CSS, JavaScript) for the dashboard
- `equinox_configurator/` - Service configuration generator for dynamic project creation

### Files
- `equinox.Dockerfile` - Container definition for the Equinox Node.js application
- `equinox_package.json` - Node.js dependencies specification
- `equinox_package-lock.json` - Locked dependency versions for reproducible builds
- `docker-compose.yml.example` - Example docker-compose configuration

### Documentation
- `README.md` (this file) - Overview
- `EQUINOX_QUICKSTART.md` - Getting started guide with examples
- `INTEGRATION_CHECKLIST.md` - Step-by-step checklist for integration

## Key Features

✅ **Monitor Mode** - System monitoring, log analysis, and data validation  
✅ **MQTT Publishing** - AWS IoT Core integration with 60-second reporting intervals  
✅ **Web Dashboard** - Real-time system status and chat interface  
✅ **Log Analysis** - Automatic ERROR/WARNING detection from container logs  
✅ **Data Validation** - 10-minute window validation for JSON data files  
✅ **Chat Interface** - AI-powered queries about system status  

## Directory Structure

```
equinox_template/
├── equinox_src/                    # Application source code
│   ├── services/                   # Service modules (monitor.py, scheduler, etc.)
│   ├── routes/                     # Express route handlers
│   ├── configurator/               # Project creation utilities
│   ├── server.js                   # Express server setup
│   ├── start.js                    # Application entry point
│   └── ...
├── equinox_public/                 # Static web assets
│   ├── index.html                  # Dashboard HTML
│   ├── css/                        # Stylesheets
│   └── js/                         # Frontend JavaScript
├── equinox_configurator/           # Configuration management
│   ├── ProjectCreator.js           # Service project generator
│   ├── components/                 # Service blueprints
│   └── ...
├── equinox.Dockerfile             # Container build definition
├── equinox_package.json            # Dependencies
├── equinox_package-lock.json       # Locked versions
├── docker-compose.yml.example      # Example compose config
├── README.md                       # This file
├── EQUINOX_QUICKSTART.md          # Getting started
└── INTEGRATION_CHECKLIST.md        # Integration steps
```

## Integration Overview

This template is designed to be copied into existing Balena projects. The files use the `equinox_` prefix to avoid conflicts with existing project structures.

### Naming Conventions

- Directories: `equinox_src`, `equinox_public`, `equinox_configurator`
- Package files: `equinox_package.json`, `equinox_package-lock.json`
- Dockerfile: `equinox.Dockerfile`
- Monitor Dockerfile: `equinox_src/services/monitor.Dockerfile`

This approach allows Equinox to coexist with other project services without naming conflicts.

## Services Added to docker-compose.yml

### equinox
- Node.js application server (port 3000)
- Runs Equinox deployment/monitoring interface
- Reads from `collect_data` volume
- Accesses Docker socket for container management

### monitor
- Python service for system monitoring
- Publishes MQTT messages to AWS IoT Core
- Analyzes container logs hourly
- Validates collected data every 30 seconds
- Publishing interval: 60 seconds

## Environment Variables

Device-level environment variables (set in Balena Cloud):

| Variable | Default | Purpose |
|----------|---------|---------|
| `SITE_ID` | - | Device/site identifier for MQTT topics |
| `IOT_PUBLISH_ENABLED` | `true` | Enable/disable MQTT publishing |
| `IOT_TOPIC` | `operate/device_reports` | MQTT topic root |
| `AWSENDPOINT` | - | AWS IoT endpoint URL |
| `THINGNAME` | - | AWS IoT thing name |
| `CERT` | - | TLS certificate (PEM format) |
| `KEY` | - | TLS private key (PEM format) |
| `CA_1` | - | CA certificate (PEM format) |

## Getting Started

1. **Read** `EQUINOX_QUICKSTART.md` for overview and configuration details
2. **Use** `INTEGRATION_CHECKLIST.md` to ensure all steps are completed
3. **Copy** all files to your project
4. **Update** your `docker-compose.yml` with equinox and monitor services
5. **Deploy** with `balena push YOUR_DEVICE_NAME`

## Troubleshooting

See `INTEGRATION_CHECKLIST.md` for comprehensive troubleshooting steps.

Quick checks:
- Logs: `balena logs equinox` or `balena logs equinox-monitor`
- Running containers: `balena ps`
- Docker socket access: `balena exec equinox ls -la /var/run/docker.sock`

## Support

For detailed architecture information, see the main Equinox repository documentation. This template is based on production deployments across multiple Balena devices (Zehr, Centennial, Northglenn, and others).

## License

Same as parent Equinox project.

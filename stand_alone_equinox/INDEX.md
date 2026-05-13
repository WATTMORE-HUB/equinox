# Equinox Standalone Package - File Index

## Quick Reference

**Start here:** README.md (overview) → DEPLOYMENT_CHECKLIST.md (step-by-step) → SETUP_GUIDE.md (reference)

---

## Documentation Files

### README.md
Quick overview of what's included and how to get started. Read this first for a 2-minute summary.

### DEPLOYMENT_CHECKLIST.md
Step-by-step checklist for deploying Equinox to your existing Balena projects. Use this while deploying.

### SETUP_GUIDE.md
Comprehensive reference guide covering:
- Environment variables (all options)
- Merging docker-compose.yml files
- Configuration modes (setup vs monitoring)
- Troubleshooting guide
- Advanced configuration options

### INDEX.md
This file. File structure and what each directory contains.

---

## Application Files

### Dockerfile
- Node 18 Alpine container image
- Installs dependencies and sets up Equinox service
- Includes health check

### package.json
- Node.js dependencies and scripts
- Express, Docker client, AWS SDK, cron scheduling
- Development scripts (nodemon)

### docker-compose.yml
- Pre-configured for Balena deployment
- Mounts Docker socket and data volumes
- Ready to merge with existing projects

---

## Source Code

### src/
Complete Equinox application code

**Key files:**
- `start.js` — Application entry point
- `server.js` — Express server setup and routing
- `stateManager.js` — Persistent state management

**Subdirectories:**
- `routes/` — API endpoints
  - `chat.js` — Chat interface (monitor mode)
  - `deployment.js` — Deployment endpoints (config mode)
  - `status.js` — Status/health endpoints
  
- `services/` — Business logic
  - `deployer.js` — Deployment orchestration
  - `configGenerator.js` — Docker-compose generation
  - `logAnalyzer.js` — Container log analysis
  - `dataValidator.js` — JSON file validation
  - `llmClientNode.js` — LLM integration
  - `intentMatcher.js` — Intent detection and fuzzy matching
  - `responseFormatter.js` — Response formatting with suggestions
  - `scheduler.js` — Cron job management
  - `balenaTokenManager.js` — Token persistence
  - `timestreamChecker.js` — AWS Timestream queries
  - `hardwareConfigLoader.js` — Hardware profile loading
  - `monitor.py` — Python monitoring service
  
- `configurator/` — Deployment configuration
  - `ProjectCreator.js` — Service project generation
  
- `utils/` — Helper functions

---

## Frontend

### public/dashboard.html
Single-page application with:
- Deployment configuration interface (config mode)
- Chat interface for system monitoring (monitor mode)
- Real-time system status and logs
- Responsive design

---

## Configurator

### configurator/
Service deployment configuration system

**Key files:**
- `create-project.js` — Main project creation script
- `components/` — Service templates (blueprints)
- `finished_projects/` — Generated project output

---

## Directory Structure for Integration

When copied to your Balena project, the structure looks like:

```
your-balena-project/
├── README.md                    # This package overview
├── DEPLOYMENT_CHECKLIST.md     # Step-by-step deployment guide
├── SETUP_GUIDE.md              # Detailed configuration reference
├── INDEX.md                     # File index (this file)
├── docker-compose.yml           # Merge with your existing file
├── Dockerfile                   # Equinox container image
├── package.json                 # Node dependencies
├── src/                         # Application code
├── public/                      # Frontend dashboard
├── configurator/                # Service deployment system
└── [your existing files]        # Your project's other services
```

---

## File Sizes

- **Package (without node_modules):** ~5 MB
- **Dockerfile base:** Node 18 Alpine (~170 MB when built)
- **Final image:** ~250-300 MB (includes all dependencies)

---

## Environment Variables Quick Reference

**Critical (must set):**
- `BALENA_API_TOKEN` — Your Balena API token

**Mode:**
- `EQUINOX_MODE` — `configure` (default) or `monitor`

**Optional:**
- `LOG_CHECK_INTERVAL` — Log analysis frequency (ms, default 3600000)
- `MONITORING_INTERVAL` — Monitor service poll rate (sec, default 300)

**AWS IoT (optional):**
- `IOT_PUBLISH_ENABLED`, `AWSENDPOINT`, `THINGNAME`, `CERT`, `KEY`, `CA_1`

See SETUP_GUIDE.md for complete reference.

---

## Getting Started

1. **Read:** README.md (5 min)
2. **Prepare:** DEPLOYMENT_CHECKLIST.md (10 min prep)
3. **Deploy:** Follow checklist (5-10 min push + build)
4. **Verify:** Health check and dashboard access (5 min)
5. **Reference:** SETUP_GUIDE.md for configuration (as needed)

---

## Support Resources

- **This package:** README.md → SETUP_GUIDE.md
- **Balena deployment:** https://www.balena.io/docs/
- **Docker Compose:** https://docs.docker.com/compose/

---

**Version:** 1.0  
**Created:** May 2026  
**Compatible with:** Balena devices (CM4, RPi, etc.)

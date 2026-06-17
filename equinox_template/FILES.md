# Equinox Template - Files and Contents

## Quick File Reference

Use this guide to understand what each file does and when you need it.

### Core Application Files (Required)

```
equinox_template/
├── equinox_src/                 # Main application code (~12 MB)
│   ├── server.js                # Express server initialization
│   ├── start.js                 # Application entry point
│   ├── stateManager.js          # State persistence (JSON file ops)
│   ├── routes/
│   │   ├── deployment.js        # POST /api/deployment/deploy
│   │   ├── chat.js              # POST /api/chat/* endpoints
│   │   └── status.js            # GET status endpoints
│   ├── services/
│   │   ├── monitor.py           # System monitoring + MQTT publishing
│   │   ├── monitor.Dockerfile   # Python container for monitor service
│   │   ├── scheduler.js         # Cron job management
│   │   ├── logAnalyzer.js       # ERROR/WARNING extraction from logs
│   │   ├── dataValidator.js     # JSON file validation (10-min window)
│   │   ├── llmClientNode.js     # LLM integration for chat
│   │   ├── timestreamChecker.js # AWS Timestream freshness checks
│   │   ├── redeployHelper.js    # Trigger redeploy from UI
│   │   └── ... (other services)
│   ├── configurator/            # Service project generator
│   ├── utils/
│   └── create-project.js        # Project creation script
│
├── equinox_public/              # Static web assets (~2 MB)
│   ├── index.html               # Main dashboard
│   ├── css/                     # Stylesheets
│   └── js/                      # Frontend JavaScript
│
├── equinox_configurator/        # Configuration/templates
│   ├── ProjectCreator.js        # Service project generator
│   ├── components/              # Service blueprints (200 MB+)
│   └── ... (templates)
```

### Docker & Deployment Files (Required)

```
├── equinox.Dockerfile          # Node.js container build definition
│                               # Uses equinox_package*.json
│                               # Copies equinox_src → ./src
│
├── equinox_package.json        # Node.js dependencies list
├── equinox_package-lock.json   # Locked dependency versions
│
└── docker-compose.yml.example  # Reference compose configuration
                                # Shows equinox + monitor services
                                # Use as template for your compose file
```

### Documentation Files (Recommended)

```
├── README.md                    # This template overview
├── EQUINOX_QUICKSTART.md       # Getting started guide
├── INTEGRATION_CHECKLIST.md    # Step-by-step integration checklist
└── FILES.md                    # This file
```

## File Sizes

| Directory | Size | Notes |
|-----------|------|-------|
| `equinox_src/` | ~12 MB | Main application code |
| `equinox_public/` | ~2 MB | Static assets |
| `equinox_configurator/` | ~200 MB | Includes service blueprints |
| **Total** | **~214 MB** | Full template |

## When to Copy What

### Minimal Equinox Setup
- `equinox_src/` → Equinox app
- `equinox_public/` → Web dashboard
- `equinox_configurator/` → (Recommended, but can skip initially)
- `equinox.Dockerfile` → Build definition
- `equinox_package*.json` → Dependencies

### Full Setup (Recommended)
- Everything above
- `docker-compose.yml.example` → Reference for your compose config
- All documentation files

### Don't Skip
- `equinox_package-lock.json` → Ensures reproducible builds
- `monitor.Dockerfile` → Required for MQTT publishing
- `monitor.py` → System monitoring service

## File Relationships

```
Build Flow:
docker-compose.yml
  ├─ equinox service
  │  └─ equinox.Dockerfile
  │     ├─ reads equinox_package*.json
  │     └─ copies equinox_src/
  │        └─ runs src/start.js
  │
  └─ monitor service
     └─ equinox_src/services/monitor.Dockerfile
        └─ runs monitor.py
           └─ publishes to AWS IoT Core
```

## Critical Files for Each Function

### Web Dashboard
- `equinox_public/index.html` - UI
- `equinox_src/server.js` - Express routing
- `equinox_src/start.js` - Entry point

### System Monitoring
- `equinox_src/services/monitor.py` - Core monitor service
- `equinox_src/services/monitor.Dockerfile` - Python container
- `equinox_src/services/scheduler.js` - Job scheduling
- `equinox_src/services/logAnalyzer.js` - Log parsing

### MQTT Publishing
- `equinox_src/services/monitor.py` - AWS IoT integration
- Requires: `SITE_ID`, `AWSENDPOINT`, `THINGNAME`, certificates

### Data Validation
- `equinox_src/services/dataValidator.js` - JSON validation
- Checks files in `/collect_data/*` with 10-minute window

### Chat Interface
- `equinox_src/routes/chat.js` - Chat endpoints
- `equinox_src/services/llmClientNode.js` - LLM client
- `equinox_src/services/timestreamChecker.js` - Data queries

## Configuration Files

### Environment (Device-Level)
Set in Balena Cloud → Device → Environment Variables:
- `SITE_ID` - Device identifier
- `IOT_PUBLISH_ENABLED` - true/false
- `IOT_TOPIC` - MQTT topic root
- AWS credentials (CERT, KEY, CA_1, AWSENDPOINT, THINGNAME)

### Docker (Container-Level)
In `docker-compose.yml` environment sections:
- `EQUINOX_MODE` - "config" or "monitor"
- `MONITORING_INTERVAL` - 60 (seconds)
- `SYSTEM_REPORT_INTERVAL` - 60 (seconds)
- `LOG_CHECK_INTERVAL` - 3600000 (milliseconds)
- `VALIDATION_WINDOW` - 600000 (milliseconds)

## Special Directories

### equinox_configurator/components/
Contains service blueprints (~200 MB). Only needed if using Config Mode to deploy services from the UI.

Each component includes:
- Service source code
- Dockerfile
- Requirements/dependencies
- Configuration templates

### equinox_src/services/
Core service implementations:
- `monitor.py` - Monitoring + MQTT
- `scheduler.js` - Cron jobs
- `logAnalyzer.js` - Log parsing
- `dataValidator.js` - JSON validation
- `llmClientNode.js` - LLM integration
- `timestreamChecker.js` - Timestream queries

## Copying to Your Project

Recommended copy command:
```bash
cp -r /path/to/equinox_template/* /path/to/your/project/
```

This copies:
- All directories and subdirectories
- All files including hidden files (.*) 
- Preserves directory structure
- Overwrites any existing equinox_* files

Alternative (if you want to review first):
```bash
cp -r /path/to/equinox_template/equinox_* /path/to/your/project/
cp /path/to/equinox_template/equinox.Dockerfile /path/to/your/project/
cp /path/to/equinox_template/docker-compose.yml.example /path/to/your/project/
```

## Git Considerations

When adding to git, you may want to:
- Ignore `equinox_configurator/components/` (large, not usually modified)
- Include everything else
- Add to `.gitignore`:
  ```
  equinox_src/services/__pycache__/
  equinox_public/node_modules/
  .DS_Store
  ```

## Troubleshooting by File

**equinox.Dockerfile won't build?**
- Check `equinox_package*.json` exists
- Check `equinox_src/` contains `start.js`
- Verify paths in COPY commands

**Monitor service fails to start?**
- Check `equinox_src/services/monitor.Dockerfile` exists
- Verify `monitor.py` has execute permissions
- Check environment variables set in compose

**Web dashboard won't load?**
- Check `equinox_public/` exists and contains `index.html`
- Verify `equinox_src/server.js` is serving static files
- Check logs: `balena logs equinox`

**MQTT publishing fails?**
- Check `monitor.py` exists in `equinox_src/services/`
- Verify AWS credentials in environment variables
- Check SITE_ID is set
- Verify AWSENDPOINT format

## Size Optimization

If space is a concern:
- `equinox_configurator/components/` can be omitted if not using Config Mode
- Saves ~200 MB
- Still need `equinox_configurator/ProjectCreator.js`

Minimal configuration:
```
equinox_src/
equinox_public/
equinox_configurator/ProjectCreator.js  (minimal, not full directory)
equinox.Dockerfile
equinox_package*.json
```

# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Critical Rules

**IMPORTANT: Never run `git push` or `balena push` commands. The user will do these themselves.**

These commands must always be executed by the user manually. Do not combine them with other commands in a single shell invocation. Always leave these as the user's responsibility.

## Overview

Equinox is a location-aware device deployment system for Balena devices with automatic geolocation detection, hardware discovery, and one-click deployment. It includes a chat interface for system monitoring and operational insights.

## Build and Run

### Development
```bash
npm install
npm run dev          # Start with hot reload (nodemon)
```

### Production
```bash
npm start            # Run src/start.js
```

### Docker
```bash
docker build -t equinox .
docker-compose up -d  # Use docker-compose.yml for config mode
docker-compose -f docker-compose.prod.yml up -d  # Use for monitor mode
```

## Testing

See `docs/TESTING.md` for comprehensive testing procedures. Key commands:
```bash
# Health check
curl http://<device-ip>/health

# View all deployments
curl http://<device-ip>/api/status/deployments

# View deployment details
curl http://<device-ip>/api/status/deployment/<deploymentId>

# View deployment errors
curl http://<device-ip>/api/status/errors/<deploymentId>

# View system report
curl http://<device-ip>/api/chat/system-report
```

## Key Architecture

### Dual-Mode System
Equinox runs in two distinct modes controlled by `EQUINOX_MODE` environment variable:

1. **Config Mode** (`EQUINOX_MODE=config` or unset)
   - Handles initial device configuration and service deployment
   - Displays dashboard with Balena token/device ID input
   - Routes: `src/routes/deployment.js` (POST /api/deployment/deploy)
   - Used when setting up a new device

2. **Monitor Mode** (`EQUINOX_MODE=monitor`)
   - Provides chat interface for system monitoring after setup
   - Displays system health, container logs, and metrics
   - Routes: `src/routes/chat.js` (POST /api/chat/*)
   - Runs Python monitor service alongside Node server

### Core Components

**Entry Points:**
- `src/start.js` — Initializes system, checks for configurator, starts server
- `src/server.js` — Express server initialization, middleware setup, route registration

**State Management:**
- `src/stateManager.js` — Atomic file operations for `/collect_data/state.json` (survives restarts)
- `src/services/balenaTokenManager.js` — Token persistence and loading from secure storage

**Deployment (Config Mode):**
- `src/services/deployer.js` — Dual-mode deployment logic (USE_CLOUD variable switches between local and EC2)
- `src/services/configGenerator.js` — Generates docker-compose and project configuration
- `src/configurator/ProjectCreator.js` — Wraps create-project.js to generate service projects from components/
- `src/routes/deployment.js` — Handles deployment form submissions

**Cloud Deployment (EC2 + Lambda):**
- `ec2/lambda-handler.js` — Lambda entry point; validates input, enqueues to S3
- `ec2/runner.js` — EC2 script; polls S3, executes balena push, archives results
- `ec2/bootstrap.sh` — EC2 startup script; installs Node, balena-cli, Python

**Monitoring (Monitor Mode):**
- `src/services/scheduler.js` — Cron jobs for log analysis and data validation
- `src/services/logAnalyzer.js` — Extracts ERROR/WARNING from container logs hourly
- `src/services/dataValidator.js` — Validates JSON files in `/collect_data/` every 30s (10-min window)
- `src/services/llmClientNode.js` — LLM integration for chat responses
- `src/routes/chat.js` — Chat API endpoints (POST /api/chat/*)
- `src/services/hardwareConfigLoader.js` — Loads hardware profiles from JSON manifests
- `src/services/monitor.py` — Separate Python service for system metrics collection and AWS IoT publishing
- `src/services/timestreamChecker.js` — Queries AWS Timestream for data freshness checks
- `src/services/redeployHelper.js` — Triggers redeploy from Monitor mode chat

**API Routes:**
- `src/routes/status.js` — GET endpoints for deployment/error status
- `src/routes/chat.js` — POST endpoints for chat queries (monitor mode only)

### Data Flow: Deployment
```
User submits deployment from Config Mode dashboard
  ↓
POST /api/deployment/deploy with Balena token, device ID, services CSV
  ↓
src/services/deployer.js checks USE_CLOUD env var
  ├─ if false: local mode → src/configurator/ProjectCreator → generate project
  └─ if true: cloud mode → POST to API Gateway → Lambda → S3 → EC2 runner
```

### Data Flow: Monitoring (Monitor Mode)
```
Container logs (hourly) → src/services/logAnalyzer.js → state.json
JSON files (30s interval, 10-min window) → src/services/dataValidator.js → state.json
Chat query → src/routes/chat.js → src/services/llmClientNode.js → Response
Timestream check → src/services/timestreamChecker.js → table freshness status
```

## Environment Variables

### Core
- `PORT` — Server port (default: 80)
- `NODE_ENV` — Environment (default: production)
- `EQUINOX_MODE` — "config" or "monitor" (defaults to config if unset)
- `STATE_FILE_PATH` — State file location (default: /collect_data/state.json)
- `SITE_ID` — Device site identifier for Timestream queries

### Data Paths
- `COLLECT_DATA_PATH` — Data volume path (default: /collect_data)
- `DOCKER_SOCKET` — Docker socket path (default: /var/run/docker.sock)

### Deployment
- `USE_CLOUD` — Enable cloud deployments (true/false, default: true)
- `CLOUD_API_URL` — API Gateway endpoint for cloud deployments
- `BALENA_API_TOKEN` — Token for Balena API calls
- `BALENA_DEVICE_UUID` — Device UUID (set via /api/deployment/deploy)

### Monitoring
- `LOG_CHECK_INTERVAL` — Log analysis interval in ms (default: 3600000 = 1 hour)
- `VALIDATION_WINDOW` — Data validation window in ms (default: 600000 = 10 minutes)
- `MONITORING_INTERVAL` — Monitor.py polling interval in seconds (default: 300)

### AWS IoT (Optional)
- `IOT_PUBLISH_ENABLED` — Enable IoT Core publishing (true/false)
- `AWSENDPOINT` — AWS IoT endpoint URL
- `THINGNAME` — Device thing name in AWS IoT
- `CERT`, `KEY`, `CA_1` — Certificate contents (PEM format)
- `CERT_NAME`, `KEY_NAME`, `CA_1_NAME` — Certificate filenames

### EC2/Lambda
- `EC2_INSTANCE_ID` — Instance ID (set in Lambda env)
- `REPO_PATH` — Repository path on EC2 (default: ~/equinox)
- `S3_BUCKET` — S3 bucket for project archival
- `AWS_REGION` — AWS region (default: us-east-1)

See `docs/ENV_VARIABLES.md` for troubleshooting env var loading.

## Important Files and Directories

- `docs/` — Complete documentation (start with `AWS_SETUP.md` for production deployment)
- `src/` — Main application code
- `ec2/` — Cloud deployment scripts (Lambda + EC2)
- `components/` — Golden masters (~200MB service blueprints)
- `public/` — Static assets (dashboard.html, CSS, JS)
- `package.json` — Node dependencies
- `.env.example` — Template for environment variables
- `state.json` (generated at runtime) — Persistent deployment state

## Configuration and Secrets

- **Token persistence:** Balena tokens are stored securely in `/collect_data` in Monitor mode to survive restarts
- **State file:** Atomic writes with temp file + rename pattern to prevent corruption
- **Configurator:** Required for deployments; system warns and continues if missing
- **Docker socket:** Required for log analysis (mounted as read-only)

## Development Notes

### Adding New Routes
Register new routers in `src/server.js` with `app.use()`. Follow the pattern in `src/routes/deployment.js` and `src/routes/status.js`.

### Adding Scheduled Jobs
Use `src/services/scheduler.js` as the entry point. Add new cron jobs in `startSchedulers()`. Existing jobs: log analysis (hourly), data validation (30s interval).

### Working with State
Always use `src/stateManager.js` for reading/writing state.json. It handles atomic writes and prevents concurrent access issues.

### Cloud Deployment Flow
- CM4 in Config Mode → POST /api/deployment/deploy (USE_CLOUD=true)
- Deployer calls API Gateway → Lambda validates and enqueues to S3
- EC2 poller runs via cron, checks S3 for pending deployments
- EC2 runner executes, publishes completion status back to CM4
- CM4 updates deployment status from callback webhook

## Chat Features (Monitor Mode)

### System Status Queries
Ask about containers, errors, warnings, memory, CPU, health status.

### File Data Queries
View latest JSON files from monitored directories (/meter, /tracker, /inverter, /weather, /recloser).

### Data Flow Checks
Ask "is data being uploaded?" to check Timestream freshness. Follow-up with a timespan (5 minutes, 10 minutes, etc.) to get table-by-table status.

### Redeploy
Ask "redeploy" to trigger a new deployment using the current device configuration.

### Environment Variables
Ask about updating environment variables to trigger the env upload interface.

## Testing Focus Areas

Per `docs/TESTING.md`:
1. **Feature 1 (Deployment):** Form submission, state persistence, error handling
2. **Feature 2 (Data Validation):** JSON file detection, freshness checks, 10-min window expiry
3. **Feature 3 (Log Analysis):** ERROR/WARNING filtering, hourly scheduling, error recording
4. **Monitor Mode:** Chat interface, system reports, Timestream data checks, redeploy, AWS IoT publishing

See `docs/TESTING.md` for complete test scenarios and troubleshooting.

## Troubleshooting

**Startup issues:** Check `docs/ENV_VARIABLES.md` for env var loading problems.
**Deployment not working:** Verify configurator exists; check `src/start.js` warnings.
**Log analysis failing:** Docker socket must be mounted with `-v /var/run/docker.sock:/var/run/docker.sock:ro`.
**State file missing:** System recreates on next restart (uses atomic writes).
**Timestream checks failing:** Verify IAM policy includes timestream:Select permissions on operateSolarDB-prod. See `docs/TIMESTREAM_IAM_POLICY.md`.

See `docs/TESTING.md` for feature-specific troubleshooting.

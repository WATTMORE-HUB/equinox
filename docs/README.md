# LLM Deployment Manager for CM4

A localized LLM system for Raspberry Pi Compute Module 4 (CM4) that enables field-deployable service management without requiring local laptop-based tools.

## Features

- **Automated Service Deployment**: Deploy services via web interface using Balena API
- **Proactive Log Monitoring**: Hourly automated Docker log analysis for ERROR and WARNING levels
- **Data Validation**: Automatic JSON file validation during 10-minute post-deployment window
- **Persistent State**: All deployments and monitoring history stored in `/collect_data/state.json`

## Architecture

```
┌─────────────────────┐
│   Web Dashboard     │
│  (browser-based)    │
└────────┬────────────┘
         │
    ┌────┴──────────────────┐
    │   Express.js Server   │
    │   (Port 3000)         │
    └────┬────────────────────┘
         │
    ┌────┴──────────────────────────┐
    │  Background Schedulers        │
    │ • Hourly log analysis         │
    │ • 30-sec data validation      │
    └────┬──────────────────────────┘
         │
    ┌────┴──────────┬────────────┬──────────────┐
    │               │            │              │
┌───▼────┐  ┌──────▼─────┐  ┌───▼──────┐  ┌──▼────────┐
│ Docker │  │ Balena API │  │ /collect │  │ State     │
│ Daemon │  │            │  │ _data/   │  │ Manager   │
└────────┘  └────────────┘  └──────────┘  └───────────┘
```

## Directory Structure

```
llm_deployment/
├── src/
│   ├── server.js              # Express server entry point
│   ├── stateManager.js        # State file I/O and locking
│   ├── routes/
│   │   ├── deployment.js      # POST /api/deployment/deploy
│   │   └── status.js          # Status query endpoints
│   └── services/
│       ├── deployer.js        # Balena API integration
│       ├── scheduler.js       # Background job orchestration
│       ├── logAnalyzer.js     # Docker log parsing
│       └── dataValidator.js   # JSON file validation
├── public/
│   └── dashboard.html         # Web UI
├── package.json
├── .env.example
└── README.md
```

## Setup

### Prerequisites

- Node.js 16+ (or running on CM4 via Docker)
- Docker daemon accessible at `/var/run/docker.sock`
- Shared Docker volume at `/collect_data` (for state and JSON outputs)
- Balena API token with device management permissions

### Local Development

1. Clone/extract this directory
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env` file (copy from `.env.example`):
   ```bash
   cp .env.example .env
   ```

4. For local testing, create a `collect_data` directory:
   ```bash
   mkdir collect_data
   ```

5. Start the server:
   ```bash
   npm start
   ```

6. Access the dashboard at `http://localhost:3000`

### CM4 Docker Deployment

This system is designed to run as a service in your CM4's docker-compose.yml:

```yaml
services:
  llm-deployment:
    build: ./tools/llm_deployment
    container_name: llm-deployment
    ports:
      - "3000:3000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - collect_data:/collect_data
    environment:
      - PORT=3000
      - STATE_FILE_PATH=/collect_data/state.json
      - COLLECT_DATA_PATH=/collect_data
      - NODE_ENV=production
```

Create a `Dockerfile` in the project root:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "src/server.js"]
```

## API Endpoints

### Deployment

**POST** `/api/deployment/deploy`
- Submit deployment request with Balena token, device ID, and CSV file
- Returns: `{ success, deploymentId, message, services }`

**GET** `/api/deployment/:deploymentId`
- Get deployment details
- Returns: Deployment record with metadata and error log

### Status

**GET** `/api/status/deployments`
- List all deployments
- Returns: `{ count, deployments }`

**GET** `/api/status/deployment/:deploymentId`
- Get detailed status including validation window
- Returns: Deployment with `inValidationWindow` and `validationTimeRemaining`

**GET** `/api/status/errors/:deploymentId`
- Get all errors for a deployment
- Returns: `{ deploymentId, errorCount, errors }`

**GET** `/api/status/state`
- Get entire state file (debugging)
- Returns: Raw state.json content

## State File Schema

```json
{
  "deployments": [
    {
      "id": "deploy_1234567890_abc123def",
      "timestamp": 1234567890000,
      "deviceId": "uuid-of-device",
      "services": ["service1", "service2"],
      "expectedJsonFiles": ["service1_*.json", "service2_*.json"],
      "status": "deployed",
      "validationEndTime": 1234567890000,
      "validationStatus": "valid|invalid",
      "lastLogCheck": 1234567890000,
      "errorLog": [
        {
          "timestamp": 1234567890000,
          "message": "ERROR: Something failed",
          "source": "service1|log-analyzer|data-validator"
        }
      ]
    }
  ],
  "lastLogCheck": 1234567890000,
  "config": {
    "logCheckInterval": 3600000,
    "validationWindow": 600000
  }
}
```

## Monitoring Behavior

### Log Analysis
- Triggers: Every hour (configurable via `LOG_CHECK_INTERVAL`)
- Looks for: ERROR and WARNING level logs in Python logging format
- Stores: Errors in deployment's `errorLog` array
- Pattern: `[ERROR]`, `ERROR:`, `[WARNING]`, `WARNING:`

### Data Validation
- Triggers: Every 30 seconds during 10-minute validation window
- Checks: Expected JSON files in `/collect_data` directory
- Conditions: Files must exist and be modified within last 60 seconds
- Auto-stops: After 10 minutes (validation window expires)

## Configuration

Edit `.env` to customize:
- `PORT`: Server port (default: 3000)
- `STATE_FILE_PATH`: Where to store state.json
- `COLLECT_DATA_PATH`: Where to find JSON outputs
- `LOG_CHECK_INTERVAL`: Log analysis frequency (milliseconds)
- `VALIDATION_WINDOW`: Data validation duration (milliseconds)

## Troubleshooting

**Docker socket not found**: Ensure `/var/run/docker.sock` is mounted and readable
**State file errors**: Check permissions on `/collect_data` directory
**Deployments not showing**: Verify Balena API token is valid
**Missing log errors**: Confirm deployed services match expected container names

## Next Steps

1. Integrate with existing `create-project.js` for full deployment automation
2. Implement SMS/webhook notifications for critical errors
3. Add LLM-based error analysis (suggest fixes)
4. Create mobile-friendly status alerts

## Development Notes

- State is read/written with atomic file operations (temp file + rename)
- No database—state.json is the single source of truth
- All timestamps are UTC milliseconds since epoch
- Services are matched by container name or image tag

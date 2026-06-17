# Equinox: Location-Aware Device Deployment System

Intelligent deployment dashboard for Balena devices with automatic geolocation detection, hardware discovery, and one-click deployment. Includes advanced chat interface for system monitoring and operational insights. Powered by Wattmore.

## Documentation

All documentation is in the [`docs/`](docs/) directory:

| Document | Purpose |
|----------|----------|
| [`docs/AWS_SETUP.md`](docs/AWS_SETUP.md) | **START HERE** — 8-step AWS provisioning guide (console-based, ~30 min) |
| [`docs/README_SETUP.md`](docs/README_SETUP.md) | Quick start overview with architecture and environment setup |
| [`docs/STRUCTURE.md`](docs/STRUCTURE.md) | Complete project layout and file organization reference |
| [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md) | Implementation checklist and configuration details |
| [`docs/EC2_IMPLEMENTATION_COMPLETE.md`](docs/EC2_IMPLEMENTATION_COMPLETE.md) | Architecture details and testing checklist |
| [`docs/AWS_INTEGRATION_SUMMARY.md`](docs/AWS_INTEGRATION_SUMMARY.md) | AWS infrastructure and cost breakdown |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | CM4 deployment procedures |
| [`docs/TESTING.md`](docs/TESTING.md) | Test procedures and validation |
| [`docs/PROJECT_SUMMARY.md`](docs/PROJECT_SUMMARY.md) | Original project summary |

## Dashboard Screenshots

**Auto-detection in progress**
![Equinox Dashboard - Locating](equinox1.png)

**Confirmation with hardware details and site selection fallback**
![Equinox Dashboard - Confirm](equinox2.png)

## Project Structure

```
/Users/drb/documents/equinox/
├── docs/                    # All markdown documentation
├── ec2/                     # Cloud deployment runner scripts
├── src/                     # Application code (CM4 dashboard, deployer)
├── components/              # Golden masters (200MB service blueprints)
├── package.json
└── Dockerfile
```

## Key Components

- **`src/services/deployer.js`** — Dual-mode deployment (local or cloud)
- **`src/services/monitor.py`** — System metrics collection and AWS IoT publishing
- **`src/services/systemReportGenerator.js`** — Health report aggregation and narrative generation
- **`src/routes/chat.js`** — Chat API with environment variable upload and system reports
- **`src/routes/modbus-test.js`** — Modbus register read/write API endpoints
- **`src/services/serialPortDetector.js`** — Serial port discovery for Modbus tools
- **`ec2/runner.js`** — Runs on EC2 via Systems Manager
- **`ec2/lambda-handler.js`** — Lambda entry point
- **`ec2/bootstrap.sh`** — EC2 automatic setup

## Chat Interface Capabilities

### Natural Language Intent Detection
- Rule-based intent matching for common operational questions and commands
- Recognizes system health, container status, data freshness, redeploy, environment variable, model management, and Modbus requests
- High-confidence intent routing lets common actions run without requiring a general LLM response
- Intent aliases support natural phrases such as "register test", "register write", "write modbus", and "redeploy"

### Container Log Monitoring
- Query container logs in natural language
- Automatic error and warning extraction
- Real-time status updates from Docker
- Hourly background log analysis records recent ERROR and WARNING entries into persistent state
- Monitor-mode log filtering avoids reporting Equinox's own monitor logs as application issues

### Data Directory Monitoring
- Track file freshness across monitored directories
- Monitor activity in `/collect_data/meter`, `/collect_data/tracker`, `/collect_data/inverter`, `/collect_data/weather`, `/collect_data/recloser`, and other key paths
- View human-readable timestamps for most recent files
- 30-second validation interval with a configurable 10-minute freshness window
- Persistent state survives restarts through atomic writes to `state.json`

### Environment Variable Management
- Upload CSV files with KEY,VALUE pairs
- Apply variables to device via Balena API
- Handle variables with embedded commas
- Trigger the environment variable upload workflow from chat
- Token and device configuration persistence allow monitor-mode workflows to reuse the current deployment context

### System Health Reports
- Ask "How is my system doing?" to get comprehensive report
- Reports include:
  - CPU usage and trend analysis
  - Memory usage and allocation
  - Storage utilization
  - Container health (running vs. failed)
  - Recent errors and warnings
  - Data freshness across all monitored directories
  - System temperature (if available)
- Reports automatically published to AWS IoT Core on 10-minute schedule
- JSON API endpoint at `/api/chat/system-report` for programmatic access

### Data Upload Freshness Checks
- Ask whether data is being uploaded to check AWS Timestream freshness
- Follow up with a timespan such as "5 minutes" or "10 minutes"
- Table-by-table results show which data streams are fresh or stale
- Uses SITE_ID-aware Timestream queries for deployed monitor installations

### Modbus Register Testing
- Ask to test Modbus registers from chat to open a guided form
- Automatically detects available serial ports
- Supports custom slave ID, baud rate, function code, register address, and signed/unsigned interpretation
- Accepts register addresses in decimal or hex format
- Returns structured results with raw register values and decoded values
- Chat renderer uses synchronous form creation with asynchronous serial-port loading so the UI appears reliably

### Modbus Register Writing
- Ask to write to a Modbus register from chat to open a guided write form
- Supports serial port, baud rate, register address, and target value input
- Uses the same async Modbus client pattern as the working device configuration flow
- Waits after writes to allow the device to process updates
- Reads the register back after writing so success is only reported when the value persists on the device
- Provides detailed debug output for Modbus communication troubleshooting
- Includes `/api/modbus/write` endpoint support plus chat aliases for write-register requests
- Handles invalid JSON and non-OK HTTP responses cleanly in the dashboard UI

### Device Redeploy from Monitor Mode
- Ask to redeploy from the monitor chat interface
- Uses the current stored device configuration to trigger a deployment
- Enables operational redeploys without returning to the initial configuration dashboard
- Supports cloud deployment flow through API Gateway, Lambda, S3, and the EC2 runner
- Tracks deployment status and errors through status endpoints

### Model Management (Ollama Integration)
- Ask to pull and manage local Ollama models
- TinyLlama support provides a smaller CM4-friendly model option compared with larger models such as Mistral
- Streaming model download progress with operational logging
- Model availability and Ollama health checks are integrated into chat handling

### Camera and Video Service Integration
- Supports multicontainer deployments with a camera video server routed behind nginx
- Camera UI can be served under a `/camera/` path prefix
- Video service MQTT initialization is non-blocking so Flask can start even if MQTT credentials or network access are unavailable
- MQTT connection retry uses exponential backoff and clear diagnostics for certificate or connection issues
- Nginx can wait for backend services before accepting camera traffic

### JSON Data and Status APIs
- Structured API endpoints for programmatic access
- System metrics available at `/api/chat/system-report`
- Deployment summaries available at `/api/status/deployments`
- Individual deployment details available at `/api/status/deployment/<deploymentId>`
- Deployment errors available at `/api/status/errors/<deploymentId>`
- Raw monitoring data cached for quick retrieval

## Recent Improvements

### Chat Endpoint Reliability (June 2026)
- Fixed async/await bug in dashboard where `renderModbusFormMessage()` was declared async but called synchronously, preventing form rendering
- Converted form rendering to synchronous with asynchronous serial-port loading via IIFE pattern for reliable UI display
- Added comprehensive logging to chat.js to track request flow through intent matching and response handlers
- Improved error handling for JSON parsing and invalid HTTP responses in Modbus write forms
- Added `/api/modbus/write` endpoint and chat aliases ("write", "register write", "write modbus") for consistent intent routing

### Video Server MQTT Integration (June 2026)
- Resolved 502 Bad Gateway errors on camera endpoints by making MQTT initialization non-blocking
- Created `connect_mqtt_async()` background thread with exponential backoff retry logic (5s → 10s → 20s → 40s → 60s) for resilient connection handling
- Flask now starts immediately on port 5000 even when MQTT credentials or network connectivity are unavailable
- Added graceful handling of missing MQTT certificate files and environment variables with clear diagnostic logging
- Enhanced nginx proxy configuration with `wait-for-services.sh` script to ensure backend services are ready before accepting traffic

### Repository Cleanup (June 2026)
- Removed `stand_alone_equinox/` directory (~5.2MB): superseded by `equinox_template`
- Removed `equinox_template/equinox_configurator/` (~4.7MB): unnecessary duplicate of root `/configurator` that's only used in Config Mode
- Consolidated all development and production use cases into a single, clean repository structure

## Status

[COMPLETE] Code complete and ready for AWS provisioning
- IAM roles: Already created
- EC2 + Lambda + API Gateway: Ready to provision
- S3 archival: Enabled for project history
- Chat interface: Fully operational with system monitoring and intent detection
- AWS IoT publishing: Active and scheduled
- Modbus register testing and writing: Integrated into chat workflow with reliable form-based UI
- Monitor-mode redeploy: Available from chat using stored configuration
- Video service integration: Supports multicontainer deployments with MQTT and camera endpoints
- Repository: Clean and optimized for migration


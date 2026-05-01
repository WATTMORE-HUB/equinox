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
- **`ec2/runner.js`** — Runs on EC2 via Systems Manager
- **`ec2/lambda-handler.js`** — Lambda entry point
- **`ec2/bootstrap.sh`** — EC2 automatic setup

## Chat Interface Capabilities

### Container Log Monitoring
- Query container logs in natural language
- Automatic error and warning extraction
- Real-time status updates from Docker

### Data Directory Monitoring
- Track file freshness across monitored directories
- Monitor activity in /collect_data/meter, /collect_data/tracker, and other key paths
- View human-readable timestamps for most recent files

### Environment Variable Management
- Upload CSV files with KEY,VALUE pairs
- Apply variables to device via Balena API
- Handle variables with embedded commas

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

### JSON Data Access
- Structured API endpoints for programmatic access
- System metrics available at `/api/chat/system-report`
- Raw monitoring data cached for quick retrieval

## Status

[COMPLETE] Code complete and ready for AWS provisioning
- IAM roles: Already created
- EC2 + Lambda + API Gateway: Ready to provision
- S3 archival: Enabled for project history
- Chat interface: Fully operational with system monitoring
- AWS IoT publishing: Active and scheduled


---

**Repository**: https://github.com/WATTMORE-HUB/equinox  
**Project Status**: Production-ready, AWS infrastructure ready for deployment

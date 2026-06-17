# START HERE - Equinox Template Guide

Welcome! This directory contains everything you need to add Equinox to a non-EC2 Balena project.

## What to Do First

Choose your path based on your familiarity with Equinox:

### 👤 If You're New to Equinox:
1. Read **[README.md](README.md)** - Overview of what's included
2. Read **[EQUINOX_QUICKSTART.md](EQUINOX_QUICKSTART.md)** - Step-by-step getting started

### 🚀 If You Want to Get Started Quickly:
1. Skim **[README.md](README.md)** briefly
2. Follow **[INTEGRATION_CHECKLIST.md](INTEGRATION_CHECKLIST.md)** - A detailed checklist for each step

### 📚 If You Need Technical Details:
1. Read **[FILES.md](FILES.md)** - Detailed file-by-file reference
2. Review **[docker-compose.yml.example](docker-compose.yml.example)** - Service definitions
3. Check **[equinox.Dockerfile](equinox.Dockerfile)** - Build configuration

---

## Quick Overview

**What is Equinox?**
- A system for deploying and monitoring services on Balena devices
- Provides a web dashboard for system status and management
- Publishes system metrics to AWS IoT Core every 60 seconds
- Analyzes container logs and validates data in real-time

**What's in This Template?**
- Complete, production-ready Equinox application code
- Pre-configured for Balena deployment (non-EC2)
- All necessary Docker configurations
- Comprehensive documentation

**Total Size:** 5.3 MB (core files) + ~200 MB (optional service blueprints)

---

## Three-Step Process

### Step 1: Copy Files to Your Project
```bash
cp -r /path/to/equinox_template/* /path/to/your/balena/project/
```

### Step 2: Update docker-compose.yml
Add equinox and monitor services (template in `docker-compose.yml.example`)

### Step 3: Deploy to Balena
```bash
balena push YOUR_DEVICE_NAME
```

**That's it!** Equinox will be running on your device.

---

## Documentation Map

| Document | Purpose | Read If... |
|----------|---------|-----------|
| **[README.md](README.md)** | Overview of template | Starting out |
| **[EQUINOX_QUICKSTART.md](EQUINOX_QUICKSTART.md)** | Step-by-step getting started | Ready to integrate |
| **[INTEGRATION_CHECKLIST.md](INTEGRATION_CHECKLIST.md)** | Detailed checklist | Want structured process |
| **[FILES.md](FILES.md)** | File-by-file reference | Need technical details |
| **[START_HERE.md](START_HERE.md)** | This file | You're reading it! |

---

## What Gets Deployed

### Equinox Service
- **Port:** 3000 (usually proxied through nginx)
- **Purpose:** Web interface for system monitoring
- **Features:** Log viewing, data validation, chat interface

### Monitor Service
- **Purpose:** Background monitoring and MQTT publishing
- **Interval:** Reports every 60 seconds
- **Features:** AWS IoT Core publishing, log analysis, data validation

### collect_data Volume
- **Purpose:** Shared storage for system state and collected data
- **Access:** Both equinox and monitor services use this

---

## Key Files You'll Work With

### Must Copy to Your Project
- `equinox_src/` - Main application code
- `equinox_public/` - Web dashboard
- `equinox_configurator/` - Service templates
- `equinox_package*.json` - Dependencies
- `equinox.Dockerfile` - Build definition

### Must Update in Your Project
- `docker-compose.yml` - Add equinox and monitor services

### Optional (But Helpful)
- `docker-compose.yml.example` - Reference for your edits
- All `.md` files - Documentation

---

## Accessing Equinox After Deployment

**From Your Device's Local Network:**
```
http://DEVICE_IP:3000
```

**Via Balena SSH Tunnel:**
```bash
balena ssh YOUR_DEVICE_NAME
# Then in the terminal on the device:
curl http://localhost:3000
```

**Via Balena Tunnel:**
```bash
balena tunnel YOUR_DEVICE_NAME:3000:3000
# Then access: http://localhost:3000
```

---

## Common Setup Options

### Minimal Setup (Monitor Only)
- Equinox monitoring interface
- MQTT publishing enabled
- ~5.3 MB

### Full Setup (Recommended)
- Monitoring interface
- Service templates for Config Mode
- MQTT publishing
- ~205 MB (includes 200 MB of service blueprints)

### Config Mode Setup
- Initial configuration interface
- Set to monitor mode after setup
- Same files, different `EQUINOX_MODE` env var

---

## Need Help?

### If Something Goes Wrong:
1. Check **[INTEGRATION_CHECKLIST.md](INTEGRATION_CHECKLIST.md)** troubleshooting section
2. Review **[FILES.md](FILES.md)** for file relationships
3. Check container logs:
   ```bash
   balena logs equinox
   balena logs equinox-monitor
   ```

### Common Issues:
- **Docker socket error:** Check volume mounts in docker-compose.yml
- **MQTT not publishing:** Verify AWS credentials in environment variables
- **Web dashboard won't load:** Check equinox_public/ exists and contains index.html
- **Monitor service crashing:** Check Python dependencies in monitor.Dockerfile

---

## Required Environment Variables

Set these in Balena Cloud → Device → Environment Variables:

```
SITE_ID=your-device-name
IOT_PUBLISH_ENABLED=true
IOT_TOPIC=operate/device_reports
AWSENDPOINT=your-aws-iot-endpoint
THINGNAME=your-aws-thing-name
CERT=<certificate-content>
KEY=<private-key-content>
CA_1=<ca-certificate-content>
```

(See INTEGRATION_CHECKLIST.md for more details)

---

## Next Steps

**Ready to integrate?**
→ Go to **[INTEGRATION_CHECKLIST.md](INTEGRATION_CHECKLIST.md)**

**Want to understand the structure first?**
→ Read **[README.md](README.md)** then **[FILES.md](FILES.md)**

**Looking for specific answers?**
→ Search **[EQUINOX_QUICKSTART.md](EQUINOX_QUICKSTART.md)** for your question

---

## Version Info

This template is based on production deployments to:
- Zehr (EnFORM)
- Centennial (EnFORM)
- Northglenn (EnFORM)
- OperateMeterAndWeather
- OperateMeterAndInverter
- OperateAurora

All with proven MQTT publishing, monitoring, and log analysis features.

---

**Questions? Check the relevant documentation file above, or review the troubleshooting section in INTEGRATION_CHECKLIST.md.**

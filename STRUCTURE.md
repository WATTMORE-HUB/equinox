# Equinox Project Structure

## Project Root

**Location:** `/Users/drb/documents/equinox/`

All application code, configuration, and documentation live at this single root level.

## Directory Layout

```
/Users/drb/documents/equinox/
│
├── 📄 Documentation
│   ├── AWS_SETUP.md                    ← START HERE for AWS provisioning (8 steps)
│   ├── README_SETUP.md                 ← Quick start guide
│   ├── PROJECT_STATUS.md               ← Implementation checklist
│   ├── EC2_IMPLEMENTATION_COMPLETE.md  ← Architecture details
│   ├── README.md                       ← Original project README
│   ├── DEPLOYMENT.md                   ← CM4 deployment docs
│   ├── TESTING.md                      ← Test procedures
│   └── STRUCTURE.md                    ← This file
│
├── 🔧 Application Code
│   ├── src/
│   │   ├── configurator/               # Balena project generator
│   │   ├── services/
│   │   │   ├── deployer.js            # Main: local or cloud (EC2) deployment logic
│   │   │   └── ...
│   │   ├── index.js                    # CM4 dashboard server entry point
│   │   └── ...
│   │
│   ├── components/                     # Golden masters (200MB) at project root
│   │   ├── service1/
│   │   ├── service2/
│   │   └── ...
│   │
│   ├── public/                         # Static assets for dashboard
│   ├── package.json                    # Main dependencies
│   └── Dockerfile                      # CM4 container definition
│
├── ☁️  Cloud Deployment (AWS)
│   ├── ec2/
│   │   ├── runner.js                  # Main script: runs on EC2 via Systems Manager
│   │   ├── lambda-handler.js          # Lambda entry point: receives requests from API Gateway
│   │   ├── bootstrap.sh               # EC2 setup script (Node, balena-cli, git)
│   │   └── package.json               # AWS SDK + dependencies
│   │
│   └── ecs/                            # Deprecated (Fargate approach, kept for reference)
│       └── lambda-handler.js.old
│
├── ⚙️  Configuration
│   ├── docker-compose.example.yml     # Example docker-compose
│   ├── .env.example                   # Example environment variables
│   ├── .balenaignore                  # Files to exclude from balena push
│   ├── .gitignore                     # Git ignore patterns
│   └── .DS_Store                      # macOS system file
│
└── 📦 Dependencies
    ├── node_modules/                  # npm packages
    ├── package-lock.json              # Lock file
    └── ...
```

## Key Files Explained

### Documentation (Start Here)

1. **`AWS_SETUP.md`** (8 steps, ~30 minutes)
   - Create S3 bucket (optional but recommended)
   - Launch EC2 instance
   - Clone this repo on EC2
   - Create Lambda function
   - Create API Gateway
   - Update CM4 configuration
   - Includes IAM role creation (you've done this ✅)

2. **`README_SETUP.md`** (Quick overview)
   - Architecture diagram
   - Project contents
   - Environment variables
   - Data flow walkthrough

3. **`PROJECT_STATUS.md`** (Implementation status)
   - Checklist of what's done
   - Configuration details
   - Cost breakdown
   - Next steps

### Application Code

**`src/services/deployer.js`** (Main deployment logic)
- Supports both local and cloud deployments
- Check: `USE_CLOUD` environment variable
- If `true` → calls API Gateway → Lambda → EC2
- If `false` → local project generation (user must manually `balena push`)

**`src/configurator/`** (Project generator)
- Uses `ProjectCreator` class
- Reads from `components/` directory
- Generates docker-compose files and project structure

**`src/index.js`** (CM4 Dashboard server)
- Express.js on port 80
- REST endpoints for deployments
- Web UI for status monitoring

### Cloud Deployment (EC2 + Lambda + SSM)

**`ec2/runner.js`** (Runs on EC2 instance)
- Executed by Systems Manager when Lambda sends command
- Workflow:
  1. Validates environment variables
  2. Decodes base64 CSV
  3. Parses services
  4. Calls `ProjectCreator` to generate project
  5. Authenticates with balena-cli
  6. Runs `balena push <device-name>`
  7. Archives project to S3
  8. POSTs status back to CM4

**`ec2/lambda-handler.js`** (Runs in AWS Lambda)
- Triggered by API Gateway POST requests
- Validates input (deploymentId, balenaToken, deviceId, csvData, statusCallbackUrl)
- Calls AWS Systems Manager to send command to EC2
- Returns 202 (Accepted) with command ID

**`ec2/bootstrap.sh`** (EC2 setup)
- Automatically runs when EC2 launches
- Installs: Node.js, balena-cli, git, Python, build tools
- Creates directory structure
- Prepares instance for deployment runner

### Golden Masters (Components)

**Location:** `/Users/drb/documents/equinox/components/`
**Size:** ~200MB
**Content:** Service blueprints used by `ProjectCreator`
**Used by:**
- Local deployments (CM4 generates projects)
- EC2 deployments (cloned to ~/equinox/components/)

## Deployment Modes

### Local Mode (Default)

```
CM4 Dashboard
  ↓ Deployment request
  ↓
src/services/deployer.js (USE_CLOUD=false)
  ↓
src/configurator/ProjectCreator
  ↓ Generates project directory
  ↓
Project ready: "User must run: balena push <device>"
  ↓
User manually runs balena push
```

**When to use:** Development, testing, manual control

### Cloud Mode (EC2 + Lambda)

```
CM4 Dashboard
  ↓ POST /deploy (USE_CLOUD=true)
  ↓ CLOUD_API_URL=https://...
  ↓
API Gateway
  ↓
Lambda (ec2/lambda-handler.js)
  ↓
Systems Manager SendCommand
  ↓
EC2 Instance (ec2/runner.js)
  ├─ Generates project
  ├─ Runs balena push
  ├─ Archives to S3
  └─ POSTs status back
     ↓
CM4 Dashboard (updated with status)
```

**When to use:** Production, automated deployments, no manual `balena push` needed

## Environment Variables

### For CM4

```bash
# Enable cloud deployments
USE_CLOUD=true

# API Gateway endpoint (from AWS_SETUP.md Step 7.5)
CLOUD_API_URL=https://abc123.execute-api.us-east-1.amazonaws.com/prod/deploy

# Webhook for EC2 to send status updates (CM4 running at this IP)
STATUS_CALLBACK_URL=http://your-cm4-ip/api/deployment/status

# For local deployments (default)
USE_CLOUD=false  # Falls back to local project generation
```

### For Lambda (set in AWS Console)

```bash
EC2_INSTANCE_ID=i-0123456789abcdef0
REPO_PATH=/home/ec2-user/equinox
S3_BUCKET=your-deployment-bucket
AWS_REGION=us-east-1
```

### For EC2 (via Systems Manager)

Set by Lambda when triggering EC2 command:
```bash
DEPLOYMENT_ID=deploy_abc123_1234567890
BALENA_TOKEN=<balena-api-token>
DEVICE_ID=<target-device-uuid>
CSV_DATA=<base64-encoded-services>
STATUS_CALLBACK_URL=http://cm4-ip/api/deployment/status
ENFORM_REPO_PATH=/home/ec2-user/equinox
S3_BUCKET=your-bucket
```

## File Flow Diagram

```
User submits deployment from CM4 dashboard
    ↓
POST /deploy (with services CSV, balena token, device ID)
    ↓
src/index.js (API endpoint)
    ↓
src/services/deployer.js
    ├─ if (USE_CLOUD) → POST to API Gateway
    └─ else → use local ProjectCreator
        ↓
        src/configurator/ProjectCreator
        ↓
        components/ (golden masters)
        ↓
        Generate project directory
        ↓
        Return: project path
        ↓
        Dashboard: "Ready for balena push"
```

## Quick Reference

| Question | Answer |
|----------|--------|
| **Where's the project code?** | `/Users/drb/documents/equinox/` |
| **How to start AWS setup?** | Read `AWS_SETUP.md` (8 steps) |
| **Golden masters location?** | `components/` (200MB) |
| **What runs on EC2?** | `ec2/runner.js` |
| **What runs in Lambda?** | `ec2/lambda-handler.js` |
| **CM4 server entry point?** | `src/index.js` |
| **Main deployment logic?** | `src/services/deployer.js` |
| **Enable cloud mode?** | Set `USE_CLOUD=true` |
| **S3 archival?** | Yes, projects auto-archived after `balena push` |

## Next Steps

1. **Read** `AWS_SETUP.md` to understand the 8 provisioning steps
2. **Provision** AWS resources (EC2, Lambda, API Gateway)
3. **Update** CM4 with `USE_CLOUD=true` and cloud API URL
4. **Test** end-to-end deployment from CM4 dashboard
5. **Monitor** via Systems Manager and CloudWatch logs
6. **Download** archived projects from S3 for analysis

---

**Project Status:** ✅ Code complete, ready for AWS provisioning
**Total Setup Time:** ~30 minutes (AWS provisioning only)
**Monthly Cost:** ~$8-12 (or free with free tier)

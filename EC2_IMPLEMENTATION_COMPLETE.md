# EC2-Based Cloud Deployment Implementation Complete

## What's Been Built

The system has been refactored from Fargate/ECS to use **EC2 + Lambda + Systems Manager (SSM)** for cloud-based deployments. This matches balena's workflow where you generate a project directory and run `balena push` locally—except the "local" is now an EC2 instance in AWS.

### New Files Created

1. **`ec2/runner.js`** (287 lines)
   - Runs on EC2 instance via Systems Manager
   - Decodes CSV deployment configuration
   - Calls existing `ProjectCreator` to generate project directory
   - Authenticates with Balena using token
   - Runs `balena push <device-name>` from generated project directory
   - Posts status updates back to CM4 webhook
   - Includes robust error handling and logging

2. **`ec2/lambda-handler.js`** (138 lines)
   - Replaces the old ECS Lambda handler
   - Triggered by API Gateway POST requests
   - Validates deployment parameters
   - Sends SSM SendCommand to EC2 instance
   - Returns 202 (Accepted) with command ID for async tracking
   - AWS SDK automatically included in Lambda

3. **`ec2/bootstrap.sh`**
   - Used as EC2 User Data during instance launch
   - Installs Node.js 18.x
   - Installs balena-cli globally
   - Installs build essentials, Python, git
   - Creates directory structure for deployments
   - Instructions for cloning this repository

### Modified Files

1. **`src/services/deployer.js`**
   - Changed `USE_LAMBDA` to `USE_CLOUD` for clarity
   - Changed `LAMBDA_API_URL` to `CLOUD_API_URL`
   - Renamed `deployViaLambda()` to `deployViaCloud()`
   - Now calls API Gateway endpoint that triggers Lambda → EC2 via SSM
   - Returns `commandId` instead of `taskId`
   - Maintains backward compatibility with local deployment fallback

### Removed Files

1. **`ecs/Dockerfile.balena-deployer`** — No longer needed (no container image building)
2. **`ecs/task-runner.js`** — Replaced by `ec2/runner.js`

### Documentation

**`AWS_SETUP.md`** — Complete rewrite
- 7 steps covering IAM role setup, EC2 launch, repository cloning, Lambda function creation, API Gateway setup, CM4 configuration, and testing
- Console-based instructions (no AWS CLI required)
- Covers troubleshooting for SSM command failures, Lambda timeout, and EC2 connectivity
- Cost estimation: ~$8-12/month on EC2 micro instance (may be free tier eligible)

## Architecture Flow

```
CM4 Dashboard (Port 80)
    ↓ POST /deploy + CSV + Token
    ↓
API Gateway
    ↓ POST /deploy
    ↓
Lambda Function: cloud-deployment-trigger
    ├─ Validates input
    ├─ Calls SSM SendCommand
    └─ Returns 202 with commandId
        ↓
EC2 Instance (via Systems Manager)
    ├─ Receives command from Lambda via SSM
    ├─ Runs ec2/runner.js with env vars
    ├─ Decodes CSV → Generates project
    ├─ Runs: balena login --token
    ├─ Runs: balena push <device>
    └─ POSTs status to CM4 webhook
        ↓
    CM4 Status Endpoint: /api/deployment/status
        ├─ Records deployment result
        └─ Updates dashboard UI
```

## Environment Variables for CM4

To enable cloud deployments, set these on the CM4 container:

```bash
USE_CLOUD=true
CLOUD_API_URL=https://abc123.execute-api.us-east-1.amazonaws.com/prod/deploy
STATUS_CALLBACK_URL=http://cm4-ip/api/deployment/status
```

When `USE_CLOUD=false` (default), the system falls back to local deployment (project generation without `balena push`).

## Key Differences from Fargate Approach

| Aspect | Fargate | EC2 |
|--------|---------|-----|
| **Cost** | ~$2-5/month | ~$7-10/month (free tier eligible) |
| **Warm-up** | ~30s (container spin-up) | Instant (persistent instance) |
| **Deployment Time** | Included in task duration | Part of instance run time |
| **Persistence** | Stateless tasks | Instance state (logs, temp files) |
| **Simplicity** | More moving parts | Simpler mental model (like a remote server) |
| **Scaling** | Auto-scale multiple tasks | Single instance (sufficient for 1-2/week) |

**EC2 is better for this use case** because:
1. Deployment frequency is low (1-2/week)
2. Deployment duration is variable (5-30 minutes for balena push)
3. Simple, persistent worker is easier to manage than container orchestration
4. SSM provides secure, audited command execution without SSH

## Status

✅ **Code Implementation Complete**

The codebase at `/Users/drb/documents/equinox/` is ready to deploy. Next step: Follow `AWS_SETUP.md` to provision AWS infrastructure (IAM roles, EC2, Lambda, API Gateway).

## Testing Checklist

Once AWS resources are created:

- [ ] EC2 instance launches and runs bootstrap script successfully
- [ ] Repository is cloned to `/home/ec2-user/equinox`
- [ ] Lambda function can invoke SSM SendCommand
- [ ] SSM Command history shows commands executing on EC2
- [ ] `ec2/runner.js` executes successfully with test environment variables
- [ ] Balena push completes successfully from EC2
- [ ] Status callbacks are received at CM4 webhook endpoint
- [ ] CM4 dashboard displays deployment status updates in real-time
- [ ] Cloud deployment can be toggled on/off via `USE_CLOUD` environment variable

## Files to Implement Next

**Steps 1-2 (Complete - Your IAM roles created):**
- ✅ Create EC2 Instance Role with SSM permissions
- ✅ Create Lambda Role with SSM SendCommand permissions

**Steps 3-8 (Follow AWS_SETUP.md):**
- Step 1: Create S3 bucket (optional)
- Step 3: Launch EC2 instance with bootstrap script
- Step 4: Clone repository on EC2
- Step 5: Get EC2 instance ID
- Step 6: Create Lambda function with ec2/lambda-handler.js
- Step 7: Create API Gateway with /deploy endpoint
- Step 8: Update CM4 configuration with cloud API URL

Then test end-to-end!

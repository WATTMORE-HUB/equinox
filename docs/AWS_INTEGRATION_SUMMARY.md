# AWS ECS/Lambda Integration Summary

## What's Been Built

### 1. ECS Fargate Container (`ecs/Dockerfile.balena-deployer`)
- Node.js 18 Alpine base image
- Balena CLI installed globally
- All required system dependencies (Python, Make, G++, Git, SSH, curl)
- Ready to build and push Docker images to AWS ECR

### 2. Task Runner Script (`ecs/task-runner.js`)
- Executes inside the Fargate container
- Receives deployment parameters via environment variables:
  - `DEPLOYMENT_ID`: Unique identifier for tracking
  - `BALENA_TOKEN`: Authentication token
  - `DEVICE_ID`: Target device UUID
  - `CSV_DATA`: Base64-encoded service configuration
  - `STATUS_CALLBACK_URL`: Webhook to report status back to CM4
- Steps executed:
  1. Decode and validate CSV
  2. Parse service configuration
  3. Authenticate with Balena CLI
  4. Fetch device information
  5. Run create-project.js to generate docker-compose
  6. Execute `balena push` to deploy services
  7. Send status updates back to CM4 in real-time

### 3. Lambda Handler (`ecs/lambda-handler.js`)
- Triggered by API Gateway POST requests
- Validates input parameters
- Starts ECS Fargate task with environment variables
- Returns task ARN and task ID immediately (202 Accepted)
- No timeout waiting for task completion (fully async)

### 4. Updated Deployer Service (`src/services/deployer.js`)
- Now supports both local and cloud-based deployments
- Automatically detects `USE_LAMBDA` environment variable
- If Lambda is configured: converts services to base64 CSV and calls Lambda API
- If Lambda is not configured: falls back to local create-project.js
- Maintains backward compatibility

### 5. Complete AWS Setup Documentation (`AWS_SETUP.md`)
Step-by-step guide covering:
- IAM role creation (ECS execution, ECS task, Lambda)
- ECR repository setup
- Docker image building and pushing
- VPC/subnet resources
- ECS cluster and task definition
- CloudWatch logging
- Lambda function deployment
- API Gateway configuration
- Environment variables
- Testing procedures
- Monitoring and troubleshooting
- Cost estimation (~$4-7/month for 1-2 deployments/week)

## Architecture Flow

```
CM4 Dashboard (Port 80)
    ↓ POST /deploy with CSV
    ↓ Base64 encode CSV
    ↓
API Gateway (AWS)
    ↓ Validates & routes
    ↓
Lambda Function
    ↓ Validates input
    ↓ Starts ECS task
    ↓ Returns 202 (Accepted)
    ↓
ECS Fargate Container
    ├─ Decodes CSV
    ├─ Parses services
    ├─ Authenticates with Balena
    ├─ Calls create-project.js
    ├─ Runs balena push
    └─ POSTs status to CM4 webhook
        ↓
    CM4 Status Endpoint
        ↓ Records deployment
        ↓ Updates dashboard
```

## Deployment Options

### Option A: Local Deployment (Current Default)
- Uses existing configurator on CM4
- No AWS infrastructure needed
- User manually runs `balena push` after deployment
- Good for development/testing

**To use:**
```bash
# Leave USE_LAMBDA unset or false
docker-compose up llm-deployment
```

### Option B: Cloud-Based Deployment (Lambda + ECS)
- Fully automated end-to-end deployment
- Balena push executed in the cloud
- Real-time status callbacks to CM4
- Scales seamlessly for 1-2 deployments/week
- Cost: ~$4-7/month

**To use:**
```bash
# Set environment variables
export USE_LAMBDA=true
export LAMBDA_API_URL=https://your-api-id.execute-api.us-east-1.amazonaws.com/prod/deploy
export STATUS_CALLBACK_URL=http://your-cm4-ip/api/deployment/status

# Push to device with environment variables
docker-compose up llm-deployment
```

## Next Steps to Activate AWS Integration

1. **Set up AWS Infrastructure**
   - Follow steps 1-9 in `AWS_SETUP.md`
   - Takes ~30 minutes
   - One-time setup

2. **Update CM4 Environment**
   - Add to docker-compose.yml:
     ```yaml
     environment:
       - USE_LAMBDA=true
       - LAMBDA_API_URL=https://your-api-id.execute-api.us-east-1.amazonaws.com/prod/deploy
       - STATUS_CALLBACK_URL=http://your-cm4-ip/api/deployment/status
     ```
   - Or set as .env variables

3. **Test the Integration**
   - Submit a deployment via the dashboard
   - Monitor ECS task logs in CloudWatch
   - Verify `balena push` completes successfully
   - Check deployment status updates on CM4

4. **Monitor Production Deployments**
   - View ECS task logs: `aws logs tail /ecs/enform-balena-deployer --follow`
   - View Lambda logs: `aws logs tail /aws/lambda/enform-deployment-trigger --follow`
   - Set CloudWatch alarms for task failures

## Files Modified/Created

**New files:**
- `ecs/Dockerfile.balena-deployer` - Fargate container definition
- `ecs/task-runner.js` - Deployment execution logic
- `ecs/lambda-handler.js` - Lambda entry point
- `AWS_SETUP.md` - Complete AWS setup guide
- `AWS_INTEGRATION_SUMMARY.md` - This file

**Modified files:**
- `src/services/deployer.js` - Now supports Lambda deployments

**No breaking changes** - system still works with local deployments

## Backward Compatibility

✅ The system is fully backward compatible:
- If `USE_LAMBDA` is not set → uses local deployment
- If `LAMBDA_API_URL` is not set → uses local deployment
- All existing functionality unchanged
- Existing deployments continue to work exactly as before

## Cost Breakdown (Monthly)

| Service | Usage | Cost |
|---------|-------|------|
| ECS Fargate | 2 hours/month | $2-3 |
| Lambda | <100 invocations | <$1 |
| CloudWatch Logs | ~2GB retention | <$1 |
| API Gateway | ~100 requests | <$1 |
| **Total** | **1-2 deployments/week** | **~$4-7** |

Compared to EC2: saves ~$10-25/month by only paying when tasks run.

## Key Benefits of AWS Integration

1. **Fully Automated** - No manual `balena push` needed
2. **Scalable** - Can handle multiple simultaneous deployments
3. **Cost-Effective** - Pay only for what you use
4. **Reliable** - ECS handles retry logic and failure recovery
5. **Monitored** - CloudWatch logs for all deployment activities
6. **Real-Time Feedback** - Status updates sent to CM4 during deployment
7. **Flexible** - Can switch between local and cloud deployments anytime

## Example: Using AWS Lambda

**Before (Local):**
1. User submits deployment via dashboard
2. System generates project locally
3. User sees: "Next step: Run 'balena push device-name'"
4. User manually opens terminal and runs command
5. Deployment begins

**After (Lambda):**
1. User submits deployment via dashboard
2. Lambda function starts immediately
3. ECS task runs in the cloud
4. Real-time status updates appear on dashboard
5. Deployment completes automatically
6. CM4 dashboard updates with final status

## Questions Before Deploying?

- **Do I need AWS experience?** No, `AWS_SETUP.md` is a complete step-by-step guide
- **Can I test without full AWS setup?** Yes, keep using local deployments
- **Can I switch back to local?** Yes, just unset `USE_LAMBDA` environment variable
- **What if Lambda deployment fails?** Falls back to local deployment automatically
- **Can I run both simultaneously?** Yes, the system detects `USE_LAMBDA` at runtime

## Support

If you have questions during AWS setup:
1. Check the troubleshooting section in `AWS_SETUP.md`
2. Review CloudWatch logs for specific errors
3. Verify IAM role permissions
4. Test Lambda function directly with AWS CLI (examples in docs)

---

**Status:** AWS infrastructure code is ready. System is backward-compatible and can work with or without Lambda enabled. Next step is setting up AWS resources when you're ready.

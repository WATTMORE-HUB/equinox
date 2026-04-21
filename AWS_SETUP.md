# AWS Cloud Deployment Setup Guide (EC2 + Lambda + Systems Manager)

This guide sets up cloud-based deployment orchestration. When you submit a deployment from your CM4 dashboard, it triggers a Lambda function that sends a command to an EC2 instance via AWS Systems Manager. The EC2 instance generates a project directory and runs `balena push`, exactly like the local configurator workflow.

## Architecture Overview

```

`components/` is now the cloud-side source of truth for the golden masters. The project no longer depends on `/Volumes/Macintosh HD/Users/drb/Documents/Enform/src/components`; that content has been copied into this repository so EC2 can work from the repo alone.
CM4 Dashboard
    ↓ POST /deploy (with CSV)
    ↓
API Gateway
    ↓
Lambda Function
    ↓ sendCommand via SSM
    ↓
EC2 Instance
    ├─ Decodes CSV
    ├─ Calls ProjectCreator
    ├─ Generates project directory
    ├─ Runs: balena login --token
    ├─ Runs: balena push <device-name>
    └─ POSTs status updates back to CM4
        ↓
    CM4 Status Endpoint
        ↓ Records deployment
        ↓ Updates dashboard
```

## Prerequisites

- AWS Account with federated console access
- EC2, Lambda, API Gateway, Systems Manager (SSM), and S3 permissions
- SSH or RDP access to EC2 instance (for initial setup and debugging)
- The Enform repository already cloned or ready to clone on EC2
- S3 bucket for storing archived deployments (optional but recommended)

## Step 1: Create S3 Bucket (Console) - Optional but Recommended

If you want generated deployment projects to be easy to pull back down later, create a bucket to archive them after each successful `balena push`.

1. Go to **AWS Console** → **S3**
2. Click **Create bucket**
3. **Bucket name**: `enform-deployment-archives-<your-account-id>` (must be globally unique)
4. **AWS Region**: Use the same region as EC2 and Lambda
5. Keep **Block all public access** enabled
6. Click **Create bucket**

The EC2 runner will upload archives to:
`s3://your-bucket-name/deployments/<deployment-id>/<project-name>.tar.gz`

## Step 2: Create IAM Roles (Console)

You need two roles: one for EC2 instances (so they can be managed by SSM), and one for Lambda (so it can send SSM commands).

### 2.1 Create EC2 Instance Role

1. Go to **AWS Console** → **IAM** → **Roles**
2. Click **Create role**
3. Select **Trusted entity type**: AWS service
4. Find and select **EC2**
5. Click **Next**
6. Search for and attach these managed policies:
   - `AmazonSSMManagedInstanceCore` (allows SSM to manage the instance)
   - `AmazonS3FullAccess` (allows uploading project archives to S3; can be restricted later)
7. Click **Next**
8. **Role name**: `ec2-deployment-runner-role`
9. Click **Create role**

### 2.2 Create Lambda Execution Role

1. Go to **IAM** → **Roles** → **Create role**
2. Select **Trusted entity type**: AWS service
3. Find and select **Lambda**
4. Click **Next**
5. Click **Next** again (no policies to attach yet)
6. **Role name**: `lambda-cloud-deployer-role`
7. Click **Create role**
8. Once created, click on the role to open it
9. Click **Add permissions** → **Create inline policy**
10. Switch to **JSON** tab and paste:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:SendCommand",
        "ssm:GetCommandInvocation",
        "ssm:DescribeCommand"
      ],
      "Resource": "*"
    }
  ]
}
```

11. Click **Review policy**
12. **Policy name**: `lambda-ssm-policy`
13. Click **Create policy**

## Step 3: Launch EC2 Instance (Console)

1. Go to **AWS Console** → **EC2** → **Instances**
2. Click **Launch instances**
3. **Name**: `enform-deployment-runner`
4. **AMI**: Select **Amazon Linux 2 AMI** (free tier eligible)
5. **Instance type**: `t3.micro` or `t2.micro` (free tier eligible)
6. **Key pair**: Create or select an existing key pair for SSH access
7. **Network settings**:
   - VPC: Default VPC
   - Auto-assign public IP: **Enable**
   - Security group: Create or use existing (must allow outbound HTTPS to balenaCloud)
8. **IAM instance profile**: Select `ec2-deployment-runner-role` (from Step 2.1)
9. **Advanced details** → **User data**: Copy and paste the contents of `ec2/bootstrap.sh`
   - This will automatically install Node.js, balena-cli, git, etc.
10. **Storage**: Default 30 GB is fine
11. Click **Launch instance**
12. Wait for the instance to reach **Running** state

## Step 4: Connect to EC2 and Prepare Repository

1. Once the instance is running, click on it to see details
2. Click **Connect** button
3. Choose **EC2 Instance Connect** or **SSH client** (whichever you prefer)
4. Once connected, run these commands:

```bash
# Clone the repository
git clone <your-repository-url> ~/equinox
cd ~/equinox

# Verify Node.js and balena-cli are installed
node --version  # Should be v18.x or higher
npm --version
balena --version

# Install npm dependencies for the project
npm install

# Install dependencies for ec2 runner
cd ec2
npm install
cd ..

# Verify the copied golden masters are present
ls components | head
```

## Step 5: Find Your EC2 Instance ID

1. Go to **EC2** → **Instances**
2. Find your `enform-deployment-runner` instance
3. Copy the **Instance ID** (format: `i-0123456789abcdef0`)

**Save this - you'll need it for Lambda environment variables.**

## Step 6: Create Lambda Function (Console)

### 6.1 Package Lambda Code

On your local machine (not the EC2 instance):

```bash
cd /Users/drb/documents/equinox/ec2

# Install AWS SDK (Lambda already has this, but for local testing)
npm install

# Create deployment package
zip -r ../lambda-function.zip lambda-handler.js node_modules/
```

### 6.2 Create Function in Console

1. Go to **AWS Console** → **Lambda**
2. Click **Create function**
3. **Function name**: `cloud-deployment-trigger`
4. **Runtime**: Node.js 18.x
5. **Architecture**: x86_64
6. **Execution role**: **Use an existing role** → Select `lambda-cloud-deployer-role` (from Step 2.2)
7. Click **Create function**

### 6.3 Upload Code

1. Scroll down to **Code** section
2. Click **Upload from** → **.zip file**
3. Click **Upload** and select `lambda-function.zip` from Step 5.1
4. Click **Save**

### 6.4 Set Environment Variables

1. Scroll down to **Environment variables**
2. Click **Edit**
3. Add:
   - `EC2_INSTANCE_ID`: Paste the instance ID from Step 5
   - `REPO_PATH`: `/home/ec2-user/equinox` (or wherever you cloned it)
   - `S3_BUCKET`: Your archive bucket from Step 1
   - `AWS_REGION`: Your AWS region (example: `us-east-1`)
4. Click **Save**

### 6.5 Configure Function Timeout

1. Click **Configuration** tab
2. Click **General configuration** → **Edit**
3. **Timeout**: `5 minutes` (300 seconds - balena push can take a while)
4. **Memory**: `256` MB
5. Click **Save**

## Step 7: Create API Gateway (Console)

### 7.1 Create REST API

1. Go to **AWS Console** → **API Gateway**
2. Click **Create API**
3. Choose **REST API** (not HTTP API)
4. **API name**: `cloud-deployment-api`
5. **Description**: `API for triggering cloud-based deployments`
6. Click **Create API**

### 7.2 Create /deploy Resource

1. In your API, click on `/` (root resource)
2. Click **Create resource**
3. **Resource name**: `deploy`
4. **Resource path**: `deploy`
5. Click **Create resource**

### 7.3 Create POST Method

1. Click on `/deploy` resource
2. Click **Create method**
3. Select **POST**
4. Click the checkmark

### 7.4 Configure Lambda Integration

1. **Integration type**: **Lambda function**
2. **Lambda function**: Type `cloud-deployment-trigger` (should autocomplete)
3. Click **Create**
4. **Save** if prompted

### 7.5 Deploy API

1. Click **Deploy API** at the top
2. **Stage**: `prod`
3. Click **Deploy**
4. You'll see **Invoke URL** (format: `https://abc123.execute-api.us-east-1.amazonaws.com/prod/deploy`)

**Copy and save this Invoke URL - you'll need it for CM4.**

## Step 8: Update CM4 Configuration

Add these environment variables to your CM4 deployment (in docker-compose.yml or via environment):

```yaml
environment:
  - USE_CLOUD=true
  - CLOUD_API_URL=https://abc123.execute-api.us-east-1.amazonaws.com/prod/deploy
  - STATUS_CALLBACK_URL=http://your-cm4-ip/api/deployment/status
```

Replace:
- `https://abc123.execute-api.us-east-1.amazonaws.com/prod/deploy` with your Invoke URL from Step 7.5
- `http://your-cm4-ip` with your actual CM4 IP address

Then redeploy:

```bash
balena push your-cm4-device-name
```

## Testing the Integration

### Test Lambda Directly

1. Go to **Lambda** → `cloud-deployment-trigger`
2. Click **Test** tab
3. **Test event name**: `test-deploy`
4. Paste this JSON:

```json
{
  "body": {
    "deploymentId": "test_001",
    "balenaToken": "your-actual-token",
    "deviceId": "your-actual-device-uuid",
    "csvData": "bmFtZSxzZXJ2aWNlCnRlc3Qsc2VydmljZTEK",
    "statusCallbackUrl": "http://localhost:3000/api/deployment/status"
  }
}
```

5. Click **Test**
6. Should return 202 with a `commandId`

### Test API Gateway

```bash
curl -X POST https://abc123.execute-api.us-east-1.amazonaws.com/prod/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "deploymentId": "test_001",
    "balenaToken": "your-actual-token",
    "deviceId": "your-actual-device-uuid",
    "csvData": "bmFtZSxzZXJ2aWNlCnRlc3Qsc2VydmljZTEK",
    "statusCallbackUrl": "http://localhost:3000/api/deployment/status"
  }'
```

### Monitor EC2 Execution

1. Go to **AWS Console** → **Systems Manager** → **Command history**
2. You should see commands sent to your EC2 instance
3. Click on a command to see execution status
4. Click **Output** to view logs from the runner script

## Monitoring & Troubleshooting

### View Lambda Logs

1. Go to **Lambda** → `cloud-deployment-trigger`
2. Click **Monitor** tab
3. Click **View logs in CloudWatch**
4. Browse log streams

### View EC2 SSM Agent Logs

1. Go to **Systems Manager** → **Run Command** or **Command history**
2. Find your command
3. Click it to see output and logs

### SSH into EC2 for Manual Debugging

```bash
# Find your instance
aws ec2 describe-instances --filters "Name=tag:Name,Values=enform-deployment-runner"

# SSH in (replace with your key and public IP)
ssh -i /path/to/key.pem ec2-user@<public-ip>

# Check if runner script works manually
cd ~/enform-llm-deployment
DEPLOYMENT_ID=test_001 \
BALENA_TOKEN=your-token \
DEVICE_ID=your-uuid \
CSV_DATA=bmFtZSxzZXJ2aWNlCnRlc3Qsc2VydmljZTEK \
STATUS_CALLBACK_URL=http://cm4-ip/api/deployment/status \
node ec2/runner.js
```

### Troubleshoot "Failed to send SSM command"

1. Verify EC2 instance has IAM role `ec2-deployment-runner-role`
2. Verify Lambda has IAM role `lambda-cloud-deployer-role` with SSM permissions
3. Check Systems Manager → **Managed nodes** - instance should be listed as "online"
4. Check EC2 instance security group allows SSM (SSM uses HTTPS outbound to AWS APIs)

### Troubleshoot "EC2 command failed"

1. Go to Systems Manager → **Command history**
2. Find the failed command
3. Click it and view the output/errors
4. SSH into the instance and check:
   - Repository exists: `ls ~/enform-llm-deployment`
   - Node.js works: `node --version`
   - balena-cli works: `balena version`
   - Balena token is valid: `balena auth logout && balena login --token <token>`

## Cost Estimation

**Monthly (1-2 deployments/week with t2.micro):**
- EC2 t2.micro: ~$7-10/month (may be free tier eligible)
- Lambda: <$1 (<10,000 invocations)
- API Gateway: ~$0.50 (~100 requests)
- Systems Manager: <$1

**Total: ~$8-12/month** (or free if eligible for EC2 free tier)

EC2 is simpler than Fargate because you have a persistent instance ready to go, versus spinning up containers each time.

## Summary

You've now set up:
1. ✅ IAM roles for EC2 and Lambda
2. ✅ EC2 instance with deployment runner dependencies
3. ✅ Repository cloned on EC2
4. ✅ Lambda function that sends SSM commands
5. ✅ API Gateway that triggers Lambda
6. ✅ CM4 configured to use the cloud API

Next time you deploy from the CM4 dashboard with `USE_CLOUD=true`, it will:
1. Send request to API Gateway
2. Lambda receives it
3. Lambda sends SSM command to EC2
4. EC2 runner generates project + runs `balena push`
5. Status updates appear on CM4 dashboard

No more manual `balena push` commands needed!

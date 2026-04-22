# AWS Cloud Deployment Setup Guide (Lambda + S3 + EC2 Poller)

This guide sets up cloud-based deployment orchestration using a simple and reliable approach: Lambda enqueues deployment requests to S3, and an EC2 poller processes them.

## Architecture Overview

```
CM4 Dashboard
    ↓ POST /deploy (with CSV)
    ↓
API Gateway
    ↓
Lambda Function
    ↓ writes JSON to S3
    ↓
S3 Bucket (deployments/pending/)
    ↓
EC2 Poller (runs every 60 seconds)
    ├─ Reads pending deployment JSON
    ├─ Runs: node ec2/runner.js locally
    ├─ Generates project directory
    ├─ Executes: balena push <device-name>
    └─ Moves result to S3 (completed/ or failed/)
        ↓
    CM4 Status Endpoint (via runner.js callback)
        ↓ Records deployment
        ↓ Updates dashboard
```

## Prerequisites

- AWS Account with federated console access
- EC2, Lambda, API Gateway, and S3 permissions
- SSH or RDP access to EC2 instance (for initial setup and debugging)
- The Equinox repository cloned and ready to deploy to EC2
- S3 bucket for deployment queue (same one created in Step 1)

## Step 1: Create S3 Bucket (Console)

1. Go to **AWS Console** → **S3**
2. Click **Create bucket**
3. **Bucket name**: `equinox-deployments-<your-account-id>` (must be globally unique)
4. **AWS Region**: Use the same region as EC2 and Lambda
5. Keep **Block all public access** enabled
6. Click **Create bucket**

The bucket will store deployment requests in this structure:
```
s3://your-bucket/
├─ deployments/
│  ├─ pending/        (Lambda writes here)
│  ├─ completed/      (Poller moves successful deployments here)
│  └─ failed/         (Poller moves failed deployments here)
```

## Step 2: Create IAM Roles (Console)

### 2.1 Create EC2 Instance Role

1. Go to **AWS Console** → **IAM** → **Roles**
2. Click **Create role**
3. Select **Trusted entity type**: AWS service
4. Find and select **EC2**
5. Click **Next**
6. Search for and attach these managed policies:
   - `AmazonSSMManagedInstanceCore` (allows Systems Manager to manage the instance)
   - `AmazonS3FullAccess` (allows reading/writing deployment queue to S3; can be restricted later)
7. Click **Next**
8. **Role name**: `equinox-ec2-deployment-role`
9. Click **Create role**

### 2.2 Create Lambda Execution Role

1. Go to **IAM** → **Roles** → **Create role**
2. Select **Trusted entity type**: AWS service
3. Find and select **Lambda**
4. Click **Next**
5. Search for and attach these managed policies:
   - `AWSLambdaBasicExecutionRole` (allows writing logs to CloudWatch)
   - `AmazonS3FullAccess` (allows putting deployment requests to S3)
6. Click **Next**
7. **Role name**: `equinox-lambda-deployer-role`
8. Click **Create role**

## Step 3: Launch EC2 Instance (Console)

1. Go to **AWS Console** → **EC2** → **Instances**
2. Click **Launch instances**
3. **Name**: `equinox-deployment-poller`
4. **AMI**: Select **Amazon Linux 2 AMI** (free tier eligible)
5. **Instance type**: `t3.micro` or `t2.micro` (free tier eligible)
6. **Key pair**: Create or select an existing key pair for SSH access
7. **Network settings**:
   - VPC: Default VPC
   - Auto-assign public IP: **Enable**
   - Security group: Create or use existing (must allow outbound HTTPS to AWS APIs and balenaCloud)
8. **IAM instance profile**: Select `equinox-ec2-deployment-role` (from Step 2.1)
9. **Advanced details** → **User data**: Copy and paste the contents of `ec2/bootstrap.sh`
10. **Storage**: Default 30 GB is fine
11. Click **Launch instance**
12. Wait for the instance to reach **Running** state

## Step 4: Connect to EC2 and Prepare Repository

1. Once the instance is running, click on it to see details
2. Click **Connect** button → choose **EC2 Instance Connect** or **SSH client**
3. Once connected, run these commands:

```bash
# Clone the repository
git clone https://github.com/WATTMORE-HUB/equinox.git ~/equinox
cd ~/equinox

# Verify Node.js and balena-cli are installed
node --version  # Should be v18.x or higher
npm --version
balena --version

# Install npm dependencies for the project
npm install

# Install dependencies for EC2 scripts
cd ec2
npm install
cd ..

# Verify the copied golden masters are present
ls components | head
```

## Step 5: Create Lambda Function (Console)

### 5.1 Package Lambda Code

On your local machine:

```bash
cd /Users/drb/documents/equinox/ec2

# Create deployment package
zip -r ../lambda-function.zip lambda-handler.js node_modules/
```

### 5.2 Create Function in Console

1. Go to **AWS Console** → **Lambda**
2. Click **Create function**
3. **Function name**: `equinox-cloud-deployment`
4. **Runtime**: Node.js 24.x
5. **Architecture**: x86_64
6. **Execution role**: **Use an existing role** → Select `equinox-lambda-deployer-role` (from Step 2.2)
7. Click **Create function**

### 5.3 Upload Code

1. Scroll down to **Code** section
2. Click **Upload from** → **.zip file**
3. Click **Upload** and select `lambda-function.zip` from your local machine
4. Click **Save**

### 5.4 Set Environment Variables

1. Scroll down to **Environment variables**
2. Click **Edit**
3. Add:
   - `S3_BUCKET`: Your bucket name from Step 1 (e.g., `equinox-deployments-123456`)
   - `AWS_REGION`: Your AWS region (example: `us-east-2`)
4. Click **Save**

### 5.5 Configure Function Timeout

1. Click **Configuration** tab
2. Click **General configuration** → **Edit**
3. **Timeout**: `30` seconds (deployment is async via S3, so Lambda doesn't wait)
4. **Memory**: `256` MB
5. Click **Save**

## Step 6: Create API Gateway (Console)

### 6.1 Create REST API

1. Go to **AWS Console** → **API Gateway**
2. Click **Create API**
3. Choose **REST API** (not HTTP API)
4. **API name**: `equinox-cloud-api`
5. **Description**: `API for triggering cloud-based deployments`
6. Click **Create API**

### 6.2 Create /deploy Resource

1. In your API, click on `/` (root resource)
2. Click **Create resource**
3. **Resource name**: `deploy`
4. **Resource path**: `deploy`
5. Click **Create resource**

### 6.3 Create POST Method

1. Click on `/deploy` resource
2. Click **Create method**
3. Select **POST**
4. Click the checkmark

### 6.4 Configure Lambda Integration

1. **Integration type**: **Lambda function**
2. **Lambda function**: Type `equinox-cloud-deployment` (should autocomplete)
3. Click **Create**
4. **Save** if prompted

### 6.5 Deploy API

1. Click **Deploy API** at the top
2. **Stage**: `prod`
3. Click **Deploy**
4. You'll see **Invoke URL** (format: `https://abc123.execute-api.us-east-1.amazonaws.com/prod/deploy`)

**Copy and save this Invoke URL - you'll need it for CM4.**

## Step 7: Start EC2 Poller (on EC2 instance)

1. SSH into your EC2 instance (or use Instance Connect)
2. Run the poller in the foreground to test:

```bash
cd ~/equinox
export S3_BUCKET=equinox-deployments-123456
export REPO_PATH=~/equinox
export AWS_REGION=us-east-2
node ec2/poller.js
```

You should see:
```
[2026-04-21T...] [INFO] EC2 Deployment Poller started (interval: 60000ms)
[2026-04-21T...] [INFO] S3 Bucket: equinox-deployments-123456
[2026-04-21T...] [INFO] Repository Path: ~/equinox
[2026-04-21T...] [INFO] Checking for pending deployments...
[2026-04-21T...] [INFO] No pending deployments found
```

Once confirmed working, create a systemd service to run the poller automatically:

```bash
sudo tee /etc/systemd/system/equinox-poller.service > /dev/null <<'EOF'
[Unit]
Description=Equinox Deployment Poller
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/equinox
Environment="S3_BUCKET=equinox-deployments-123456"
Environment="REPO_PATH=/home/ec2-user/equinox"
Environment="AWS_REGION=us-east-2"
ExecStart=/usr/bin/node /home/ec2-user/equinox/ec2/poller.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable equinox-poller
sudo systemctl start equinox-poller
sudo systemctl status equinox-poller
```

Check logs with:
```bash
sudo journalctl -u equinox-poller -f
```

## Step 7.5: Updating EC2 Code and Dependencies

Whenever you push updates to GitHub, the EC2 instance needs to pull them and reinstall dependencies:

```bash
# SSH into EC2
ssh -i /path/to/key.pem ec2-user@<ec2-public-ip>

# Pull latest code
cd ~/equinox
git pull origin main

# Reinstall project dependencies
npm install

# Reinstall ec2 script dependencies
cd ec2
npm install
cd ..

# Restart the poller service to pick up changes
sudo systemctl restart equinox-poller
sudo systemctl status equinox-poller
```

Always verify the poller is running after pulling new code.

## Step 8: Update CM4 Configuration

Add these environment variables to your CM4 deployment (in docker-compose.yml):

```yaml
environment:
  - USE_CLOUD=true
  - CLOUD_API_URL=https://abc123.execute-api.us-east-2.amazonaws.com/prod/deploy
```

Replace `https://abc123.execute-api.us-east-2.amazonaws.com/prod/deploy` with your Invoke URL from Step 6.5.

The `STATUS_CALLBACK_URL` is automatically constructed from `BALENA_DEVICE_UUID`.

Then redeploy:

```bash
balena push your-cm4-device-name
```

## Testing the Integration

### Test Lambda Directly

1. Go to **Lambda** → `equinox-cloud-deployment`
2. Click **Test** tab
3. **Test event name**: `test-deploy`
4. Paste this JSON:

```json
{
  "body": "{\"deploymentId\": \"test_001\", \"balenaToken\": \"fake-token\", \"deviceId\": \"fake-device\", \"csvData\": \"bmFtZSxzZXJ2aWNlCnRlc3Qsc2VydmljZTEK\"}"
}
```

5. Click **Test**
6. Should return 202 with `status: "queued"`

### Test API Gateway

```bash
curl -X POST https://abc123.execute-api.us-east-2.amazonaws.com/prod/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "deploymentId": "test_002",
    "balenaToken": "fake-token",
    "deviceId": "fake-device",
    "csvData": "bmFtZSxzZXJ2aWNlCnRlc3Qsc2VydmljZTEK"
  }'
```

### Monitor S3 Queue

Check that deployments appear in S3:
```bash
aws s3 ls s3://equinox-deployments-123456/deployments/pending/ --recursive
```

### Monitor EC2 Poller

On the EC2 instance, watch the logs:
```bash
sudo journalctl -u equinox-poller -f
```

## Troubleshooting

### Lambda Test Returns 202 but S3 Bucket is Empty

1. Verify Lambda has `AmazonS3FullAccess` policy attached
2. Verify `S3_BUCKET` environment variable is set correctly
3. Check CloudWatch logs in Lambda console

### Poller Runs but Nothing Happens

1. Verify EC2 instance has `AmazonS3FullAccess` policy in its role
2. Verify `S3_BUCKET` environment variable matches Lambda's setting
3. Check poller logs: `sudo journalctl -u equinox-poller -f`

### balena push Fails on EC2

1. Verify balena CLI is installed: `~/balena/bin/balena --version`
2. Verify balena token is valid by trying: `balena login --token <token>`
3. Check `/var/log/deployment-logs/` if logging is enabled in runner.js

## Cost Estimation

**Monthly (1-2 deployments/week):**
- EC2 t2/t3.micro: ~$7-10/month (may be free tier eligible)
- Lambda: <$1 (<100 invocations)
- API Gateway: ~$0.35 (~100 requests)
- S3: <$1 (storage + requests)

**Total: ~$8-12/month** (or free if eligible for EC2 free tier)

## Summary

You've now set up:
1. ✅ IAM roles for EC2 and Lambda
2. ✅ EC2 instance with deployment poller dependencies
3. ✅ Repository cloned on EC2
4. ✅ Lambda function that writes deployment requests to S3
5. ✅ API Gateway that triggers Lambda
6. ✅ EC2 poller that processes queued deployments
7. ✅ CM4 configured to use the cloud API

Next time you deploy from the CM4 dashboard with `USE_CLOUD=true`, it will:
1. Send request to API Gateway
2. Lambda receives it and writes to S3 (returns 202 immediately)
3. EC2 poller finds the request and processes it
4. `balena push` executes on EC2
5. Status updates appear on CM4 dashboard

No more manual `balena push` commands needed!

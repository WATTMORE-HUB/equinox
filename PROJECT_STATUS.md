# Equinox LLM Deployment - Project Status

## 🎯 Current Status: Ready for AWS Provisioning

The project has been fully restructured and moved to `/Users/drb/documents/equinox/` with S3 archival support for deployed projects.

## 📁 Project Structure

```
/Users/drb/documents/equinox/
├── src/
│   ├── configurator/              # Balena project generator
│   ├── services/
│   │   ├── deployer.js            # Dual-mode: local or cloud (EC2+Lambda)
│   │   └── ...
│   └── ...
├── ec2/
│   ├── runner.js                  # Cloud deployment executor (runs on EC2 via SSM)
│   ├── lambda-handler.js          # Lambda function (triggers EC2 via SSM)
│   ├── bootstrap.sh               # EC2 setup script (Node, balena-cli, etc.)
│   └── package.json               # AWS SDK + dependencies
├── components/                     # Golden masters (~200MB) at project root
├── AWS_SETUP.md                   # Complete console-based AWS setup guide
├── EC2_IMPLEMENTATION_COMPLETE.md # Implementation summary
├── PROJECT_STATUS.md              # This file
└── ...

```

## 🌊 Deployment Flow

```
Local Workflow (default):
  CM4 Dashboard → API → deployer.js → ProjectCreator → Project directory
  User must manually run: balena push <device>

Cloud Workflow (with AWS):
  CM4 Dashboard → API Gateway → Lambda → SSM SendCommand → EC2 Instance
  EC2 Instance runs: ec2/runner.js
    ├─ Decodes CSV
    ├─ Calls ProjectCreator (uses local components/)
    ├─ Generates project directory in ~/.deployments/
    ├─ Runs: balena push <device-name>
    ├─ Archives project to S3 as tar.gz
    └─ Posts status back to CM4
  CM4 Status Endpoint records deployment
```

## 🔑 Key Configuration Points

### Golden Masters Location

**On EC2:** `~/equinox/components/`
- This is a copy of `/Users/drb/documents/equinox/components/`
- Contains all service blueprints (~200MB)
- Used by `ProjectCreator` to generate deployment projects
- Cloned during EC2 setup (Step 4 of AWS_SETUP.md)

### Generated Projects on EC2

**Short-term:** `~/.deployments/<project-name>/`
- Generated when deployment runs
- Contains docker-compose.yml and service files
- Used by `balena push` to build and deploy

**Long-term archive:** `s3://your-bucket/deployments/<deployment-id>/<project-name>.tar.gz`
- Created after successful `balena push`
- Can be downloaded later via AWS S3 console or CLI
- EC2 keeps the project directory for local reference
- Prevents disk bloat (30GB disk with 1-2 deployments/week = no issues)

### Environment Variables for EC2 Runner

In Lambda function environment (or EC2 user data):
```bash
DEPLOYMENT_ID=deploy_abc123_1234567890
BALENA_TOKEN=<your-balena-api-token>
DEVICE_ID=<target-device-uuid>
CSV_DATA=<base64-encoded-services-csv>
STATUS_CALLBACK_URL=http://cm4-ip/api/deployment/status
ENFORM_REPO_PATH=/home/ec2-user/enform-llm-deployment
S3_BUCKET=your-deployment-bucket-name        # Optional: for archival
AWS_REGION=us-east-1                         # Defaults to us-east-1
```

## ✅ Implementation Checklist

### Code Changes (Complete ✅)
- [x] `ec2/runner.js` — Deployment executor with S3 archival
- [x] `ec2/lambda-handler.js` — SSM-based Lambda trigger
- [x] `ec2/bootstrap.sh` — EC2 automatic setup
- [x] `src/services/deployer.js` — Updated for cloud path via API Gateway
- [x] `components/` directory copied into project
- [x] `AWS_SETUP.md` rewritten for EC2 + S3 archival

### AWS Infrastructure (Next Steps)
- [ ] **Step 1:** Create S3 bucket (optional but recommended)
- [ ] **Step 1b:** Create IAM roles (you've already done this)
- [ ] **Step 2:** Launch EC2 instance with bootstrap script
- [ ] **Step 3:** Clone repo on EC2, verify setup
- [ ] **Step 4:** Note EC2 instance ID
- [ ] **Step 5:** Create Lambda function with code from ec2/
- [ ] **Step 5.4:** Add S3_BUCKET to Lambda environment
- [ ] **Step 6:** Create API Gateway
- [ ] **Step 7:** Update CM4 with cloud URLs

## 📊 Cost Analysis

**Monthly (1-2 deployments/week):**
| Service | Cost |
|---------|------|
| EC2 t2.micro | $7-10 (or free tier) |
| Lambda | <$1 |
| API Gateway | ~$0.50 |
| S3 storage | Negligible (few GB) |
| **Total** | **~$8-12/month** |

## 🚀 Next Steps

1. **Review AWS_SETUP.md** — Understand the 7-step provisioning process
2. **Start AWS setup:**
   - Create S3 bucket (optional)
   - You already created IAM roles ✅
   - Launch EC2 with bootstrap script
   - Clone repo on EC2
   - Create Lambda function
   - Create API Gateway
3. **Test end-to-end:**
   - Submit deployment from CM4 with `USE_CLOUD=true`
   - Monitor EC2 via Systems Manager
   - Verify archive in S3
   - Check CM4 status updates
4. **Going forward:**
   - Download project archives from S3 console for analysis
   - Monitor EC2 instance logs in Systems Manager
   - SSH in occasionally to clean up old `.deployments/` directories

## 📝 Notes

- **Components path:** The 200MB golden masters are now part of the repository, so EC2 doesn't need a separate S3 pull. They come with the git clone.
- **Project archival:** S3 is cheap (~$0.02/project if archival is ~100MB compressed). Worth it for audit trail and easy downloads.
- **Backward compatible:** Existing local deployments still work. Switch with `USE_CLOUD=true/false`.
- **Regional flexibility:** Currently uses us-east-1 by default. Can change via `AWS_REGION` env var.

## 🔗 Related Files

- `AWS_SETUP.md` — Step-by-step AWS provisioning
- `EC2_IMPLEMENTATION_COMPLETE.md` — Architecture details
- `src/services/deployer.js` — Deployment service logic
- `ec2/runner.js` — EC2-side execution logic
- `ec2/lambda-handler.js` — Lambda entry point

---

**Ready to proceed with AWS setup?** Follow `AWS_SETUP.md` starting from Step 1 (S3 bucket).

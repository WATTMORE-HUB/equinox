#!/bin/bash
set -e

# EC2 Bootstrap Script
# This script installs all dependencies needed to run the deployment runner
# and checks out the repository so it's ready for cloud deployments

echo "Starting EC2 bootstrap..."

# Update system
echo "Updating system packages..."
sudo yum update -y

# Install git
echo "Installing git..."
sudo yum install -y git

# Install Node.js (using NodeSource repository for latest LTS)
echo "Installing Node.js..."
curl -sL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Verify Node.js installation
echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"

# Install Python (required by some build tools)
echo "Installing Python..."
sudo yum install -y python3 python3-pip

# Install build essentials
echo "Installing build essentials..."
sudo yum groupinstall -y "Development Tools"

# Install balena-cli globally
echo "Installing balena-cli..."
sudo npm install -g balena-cli

# Verify balena-cli installation
echo "Balena CLI version: $(balena version)"

# Create deployment directory if it doesn't exist
echo "Creating deployment directories..."
mkdir -p ~/enform-llm-deployment/.deployments
mkdir -p ~/.balena

# Clone the repository (this should be done manually or via user-data with the repo URL)
# For now, just create the directory structure
echo "Repository will be cloned by SSM commands or manual setup"

# Create a log directory for deployment logs
mkdir -p ~/deployment-logs

echo "EC2 bootstrap completed successfully!"
echo ""
echo "Next steps:"
echo "1. Clone this repository to ~/enform-llm-deployment"
echo "2. Run: git clone <repo-url> ~/enform-llm-deployment"
echo "3. Ensure the EC2 instance has an IAM role with SSM permissions"
echo "4. Test by running: node ~/enform-llm-deployment/ec2/runner.js"

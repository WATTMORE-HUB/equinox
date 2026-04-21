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

# Install balena-cli from standalone binary
echo "Installing balena-cli..."
cd ~
wget https://github.com/balena-io/balena-cli/releases/download/v24.1.3/balena-cli-v24.1.3-linux-x64-standalone.tar.gz
tar xzf balena-cli-v24.1.3-linux-x64-standalone.tar.gz
rm balena-cli-v24.1.3-linux-x64-standalone.tar.gz

# Add balena-cli to PATH
echo 'export PATH="$HOME/balena/bin:$PATH"' >> ~/.bashrc
export PATH="$HOME/balena/bin:$PATH"

# Verify balena-cli installation
echo "Balena CLI version: $(balena version)"

# Create deployment directories
echo "Creating deployment directories..."
mkdir -p ~/equinox/.deployments
mkdir -p ~/.balena
mkdir -p ~/deployment-logs

echo "Repository will be cloned manually or via user data"

echo "EC2 bootstrap completed successfully!"
echo ""
echo "Next steps:"
echo "1. Clone this repository to ~/equinox"
echo "2. Run: git clone <repo-url> ~/equinox"
echo "3. Install dependencies: cd ~/equinox && npm install && cd ec2 && npm install"
echo "4. Ensure the EC2 instance has an IAM role with S3 access"
echo "5. Start the poller:"
echo "   S3_BUCKET=<bucket-name> REPO_PATH=/home/ec2-user/equinox nohup node ~/equinox/ec2/poller.js > ~/deployment-logs/poller.log 2>&1 &"

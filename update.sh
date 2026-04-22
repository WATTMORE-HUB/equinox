#!/bin/bash

# Equinox EC2 Update and Configuration Script
# This script pulls the latest code from GitHub, sets up the systemd service,
# and restarts the poller
# Run on EC2 instance: bash ~/equinox/update.sh

set -e

echo "=========================================="
echo "Equinox EC2 Update Script"
echo "=========================================="
echo ""
echo "Step 1: Ensuring latest code is available..."
if [ -d "$HOME/equinox/.git" ]; then
  echo "  Repository exists, fetching latest code..."
  cd "$HOME/equinox"
  git fetch origin main
  git reset --hard origin/main
  echo "✓ Latest code fetched"
else
  echo "  Repository not found, cloning..."
  rm -rf "$HOME/equinox"
  git clone https://github.com/enform-lp/equinox.git "$HOME/equinox"
  cd "$HOME/equinox"
  echo "✓ Repository cloned"
fi
echo "✓ Latest code pulled"
echo ""

# Step 2: Install dependencies
echo "Step 2: Installing main project dependencies..."
npm install
echo "✓ Main dependencies installed"
echo ""

echo "Step 3: Installing EC2 script dependencies..."
cd ~/equinox/ec2
npm install
cd ~/equinox
echo "✓ EC2 dependencies installed"
echo ""

# Step 4: Fix systemd service with proper PATH for balena CLI
echo "Step 4: Setting up systemd service..."

# Read environment variables or use defaults
S3_BUCKET="${S3_BUCKET:-enform-deployment-archives-211125775433}"
REPO_PATH="${REPO_PATH:-/home/ec2-user/equinox}"
AWS_REGION="${AWS_REGION:-us-east-2}"

echo "  S3_BUCKET: $S3_BUCKET"
echo "  REPO_PATH: $REPO_PATH"
echo "  AWS_REGION: $AWS_REGION"
echo ""

# Stop the service
echo "  Stopping equinox-poller service..."
sudo systemctl stop equinox-poller || true

# Create the service file with PATH for balena CLI
echo "  Creating systemd service with balena PATH..."
sudo tee /etc/systemd/system/equinox-poller.service > /dev/null <<EOF
[Unit]
Description=Equinox Deployment Poller
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=$REPO_PATH
Environment="PATH=/home/ec2-user/balena/bin:/usr/local/bin:/usr/bin:/bin"
Environment="S3_BUCKET=$S3_BUCKET"
Environment="REPO_PATH=$REPO_PATH"
Environment="AWS_REGION=$AWS_REGION"
ExecStart=/usr/bin/node $REPO_PATH/ec2/poller.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and start service
echo "  Reloading systemd configuration..."
sudo systemctl daemon-reload

echo "  Starting equinox-poller service..."
sudo systemctl start equinox-poller
echo "✓ Systemd service configured and started"
echo ""

# Step 5: Check status
echo "Step 5: Checking poller status..."
sudo systemctl status equinox-poller
echo ""

echo "Step 6: Watching logs (Ctrl+C to exit)..."
echo "=========================================="
sudo journalctl -u equinox-poller -f --lines=20

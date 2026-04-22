#!/bin/bash

# Fix the systemd service to include balena CLI in PATH
# Run this on EC2 instance to fix "spawn balena ENOENT" errors

echo "Fixing equinox-poller systemd service..."
echo ""

# Read environment variables from service if possible, otherwise use defaults
S3_BUCKET="${S3_BUCKET:-equinox-deployments-123456}"
REPO_PATH="${REPO_PATH:-/home/ec2-user/equinox}"
AWS_REGION="${AWS_REGION:-us-east-2}"

echo "Using configuration:"
echo "  S3_BUCKET: $S3_BUCKET"
echo "  REPO_PATH: $REPO_PATH"
echo "  AWS_REGION: $AWS_REGION"
echo ""

# Stop the service
echo "Stopping equinox-poller service..."
sudo systemctl stop equinox-poller || true

# Create the service file with PATH
echo "Creating systemd service with balena PATH..."
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

# Reload and restart
echo "Reloading systemd configuration..."
sudo systemctl daemon-reload

echo "Starting equinox-poller service..."
sudo systemctl start equinox-poller

echo "Checking service status..."
sudo systemctl status equinox-poller

echo ""
echo "✓ Service fixed! Watching logs (Ctrl+C to exit)..."
echo ""
sudo journalctl -u equinox-poller -f --lines=20

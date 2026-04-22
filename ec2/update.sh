#!/bin/bash

# Update EC2 Code and Dependencies
# This script pulls the latest code from GitHub and restarts the poller service
# Run on EC2 instance: bash ~/equinox/ec2/update.sh

set -e

echo "=========================================="
echo "Equinox EC2 Update Script"
echo "=========================================="
echo ""

# Check if running on EC2
if [ ! -d ~/equinox ]; then
  echo "Error: ~/equinox directory not found"
  echo "Please clone the repository first: git clone <repo-url> ~/equinox"
  exit 1
fi

echo "Step 1: Pulling latest code from GitHub..."
cd ~/equinox
git pull origin main
echo "✓ Code updated"
echo ""

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

echo "Step 4: Restarting poller service..."
sudo systemctl restart equinox-poller
echo "✓ Poller service restarted"
echo ""

echo "Step 5: Checking poller status..."
sudo systemctl status equinox-poller
echo ""

echo "Step 6: Watching logs (Ctrl+C to exit)..."
echo "=========================================="
sudo journalctl -u equinox-poller -f --lines=20

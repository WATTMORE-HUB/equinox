#!/bin/bash

# Update EC2 Code and Dependencies
# This script pulls the latest code from GitHub and restarts the poller service
# Run on EC2 instance: bash ~/equinox/ec2/update.sh

set -e

echo "=========================================="
echo "Equinox EC2 Update Script"
echo "=========================================="
echo ""

echo "Step 1: Cleaning up old code"
cd ~/
sudo rm -r ~/equinox
git clone https://github.com/WATTMORE-HUB/equinox.git ~/equinox
echo "✓ New code updated"
echo ""

echo "Step 2: Installing main project dependencies..."
cd ~/equinox
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

#!/bin/sh
# Install Python dependencies at container startup
# This avoids issues with pip during the Balena remote build

echo "[Python Installer] Starting Python dependency installation..."

# Install Python and pip from Alpine packages (no py3-serial, will use pip instead)
if ! command -v python3 >/dev/null 2>&1; then
    echo "[Python Installer] Installing Python3 and pip..."
    apk add --no-cache python3 py3-pip 2>&1 || {
        echo "[Python Installer] WARNING: Failed to install Python/pip via apk"
        exit 1
    }
else
    echo "[Python Installer] Python3 already installed"
fi

# Install required Python modules via pip
if command -v pip3 >/dev/null 2>&1; then
    echo "[Python Installer] Installing Python modbus packages..."
    pip3 install --break-system-packages --no-cache-dir minimalmodbus==2.1.1 pymodbus==3.9.2 pyserial==3.5 2>&1 || {
        echo "[Python Installer] WARNING: Failed to install Python packages via pip"
    }
    echo "[Python Installer] Python packages installation complete"
else
    echo "[Python Installer] ERROR: pip3 not found after installation attempt"
    exit 1
fi

echo "[Python Installer] Setup complete, starting Node server..."
exit 0

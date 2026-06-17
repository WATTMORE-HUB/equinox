/**
 * Serial Port Detector
 * Lists available serial ports on the system
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Get list of available serial ports
 * Returns array of port objects with name and description
 */
async function getAvailablePorts() {
  try {
    const ports = [];
    
    // Check multiple possible /dev paths for device files
    const devPaths = ['/dev', '/dev/serial/by-id', '/dev/serial/by-path'];
    
    for (const devPath of devPaths) {
      if (!fs.existsSync(devPath)) continue;
      
      try {
        const devices = fs.readdirSync(devPath);
        const serialDevices = devices.filter(device => {
          // Match common serial port patterns
          return device.startsWith('tty.') ||
                 device.startsWith('ttyUSB') ||
                 device.startsWith('ttyACM') ||
                 device.startsWith('ttyS') ||
                 device.startsWith('cu.') ||
                 device.startsWith('COM') ||
                 (devPath.includes('serial') && !device.startsWith('.'));
        });
        
        serialDevices.forEach(device => {
          const fullPath = devPath === '/dev' ? path.join(devPath, device) : path.join(devPath, device);
          // Check if path is actually accessible (avoid duplicates/broken links)
          try {
            fs.statSync(fullPath);
            ports.push({
              path: fullPath,
              name: device,
              type: getPortType(device)
            });
          } catch (e) {
            // Skip inaccessible ports
          }
        });
      } catch (e) {
        // Skip paths that can't be read
      }
    }
    
    // Remove duplicates and sort by name for consistent ordering
    const uniquePorts = [];
    const seen = new Set();
    ports.forEach(port => {
      if (!seen.has(port.path)) {
        seen.add(port.path);
        uniquePorts.push(port);
      }
    });
    uniquePorts.sort((a, b) => a.path.localeCompare(b.path));
    
    return uniquePorts;
  } catch (error) {
    console.error('[Serial Port Detector] Error listing ports:', error.message);
    return [];
  }
}

/**
 * Determine port type from device name
 */
function getPortType(deviceName) {
  if (deviceName.startsWith('ttyUSB')) {
    return 'USB Serial';
  } else if (deviceName.startsWith('ttyACM')) {
    return 'USB ACM';
  } else if (deviceName.startsWith('cu.')) {
    return 'Bluetooth/Serial';
  } else if (deviceName.startsWith('tty.')) {
    return 'Built-in';
  }
  return 'Serial Port';
}

module.exports = {
  getAvailablePorts
};

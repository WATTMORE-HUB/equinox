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
    
    // On macOS and Linux, check /dev for tty devices
    const devPath = '/dev';
    if (fs.existsSync(devPath)) {
      const devices = fs.readdirSync(devPath);
      const serialDevices = devices.filter(device => 
        device.startsWith('tty.') ||
        device.startsWith('ttyUSB') ||
        device.startsWith('ttyACM') ||
        device.startsWith('cu.')
      );
      console.log('[Serial Port Detector] Found devices:', serialDevices);
      console.log('[Serial Port Detector] All /dev entries:', devices.filter(d => d.startsWith('tty')));
      console.log('[Serial Port Detector] Looking for ttyUSB/ttyACM entries...');
      devices.filter(d => d.startsWith('ttyUSB') || d.startsWith('ttyACM')).forEach(d => console.log('  -', d));
      
      serialDevices.forEach(device => {
        const fullPath = path.join(devPath, device);
        ports.push({
          path: fullPath,
          name: device,
          type: getPortType(device)
        });
      });
    }
    
    // Sort by name for consistent ordering
    ports.sort((a, b) => a.path.localeCompare(b.path));
    
    return ports;
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

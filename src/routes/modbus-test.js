const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * POST /api/modbus/test
 * Tests a Modbus register by spawning register_test.py with environment variables
 * 
 * Request body:
 * {
 *   port: "/dev/ttyUSB0",
 *   slaveId: 1,
 *   baudRate: 9600,
 *   register: 546,  // decimal or hex
 *   signed: 0,  // 0 or 1
 *   functionCode: 3,  // optional, defaults to 3 (read holding registers)
 *   functionCodeBase: 10  // optional, base for parsing function code (10 or 16)
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   data: {
 *     register: 546,
 *     float32: 123.45,
 *     int16: 100,
 *     int32: 12345,
 *     signed: 0
 *   },
 *   output: "...",  // stdout from register_test.py
 *   resultFile: "/collect_data/test/1234567890.json",
 *   timestamp: 1234567890,
 *   metadata: {
 *     port: "/dev/ttyUSB0",
 *     slaveId: 1,
 *     baudRate: 9600
 *   }
 * }
 */

// Validate serial port accessibility
function validateSerialPort(port) {
  try {
    if (!fs.existsSync(port)) {
      return { valid: false, message: `Serial port ${port} not found. Check device connection.` };
    }
    // Try to access it
    fs.accessSync(port, fs.constants.R_OK | fs.constants.W_OK);
    return { valid: true };
  } catch (err) {
    return { valid: false, message: `Cannot access ${port}: ${err.message}. Check permissions.` };
  }
}

// Validate baud rate
function validateBaudRate(baudRate) {
  const validBaudRates = [9600, 19200, 38400, 57600, 115200];
  if (!validBaudRates.includes(parseInt(baudRate))) {
    return { 
      valid: false, 
      message: `Invalid baud rate ${baudRate}. Valid rates: ${validBaudRates.join(', ')}` 
    };
  }
  return { valid: true };
}

// Validate slave ID
function validateSlaveId(slaveId) {
  const id = parseInt(slaveId);
  if (id < 1 || id > 247) {
    return { valid: false, message: `Invalid slave ID ${slaveId}. Must be between 1-247.` };
  }
  return { valid: true };
}

// Validate register address
function validateRegister(register) {
  const reg = parseInt(register);
  if (reg < 0 || reg > 65535) {
    return { valid: false, message: `Invalid register address ${register}. Must be 0-65535.` };
  }
  return { valid: true };
}

router.post('/test', async (req, res) => {
  try {
    const {
      port,
      slaveId,
      baudRate,
      register,
      signed = 0,
      functionCode = 3,
      functionCodeBase = 10
    } = req.body;

    // Validate required parameters
    if (!port || slaveId === undefined || !baudRate || register === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: port, slaveId, baudRate, register'
      });
    }

    // Validate serial port
    const portValidation = validateSerialPort(port);
    if (!portValidation.valid) {
      return res.status(400).json({
        success: false,
        error: portValidation.message
      });
    }

    // Validate other parameters
    const baudValidation = validateBaudRate(baudRate);
    if (!baudValidation.valid) {
      return res.status(400).json({ success: false, error: baudValidation.message });
    }

    const slaveValidation = validateSlaveId(slaveId);
    if (!slaveValidation.valid) {
      return res.status(400).json({ success: false, error: slaveValidation.message });
    }

    const registerValidation = validateRegister(register);
    if (!registerValidation.valid) {
      return res.status(400).json({ success: false, error: registerValidation.message });
    }

    logger.info(`Modbus test initiated: port=${port}, slave=${slaveId}, baud=${baudRate}, register=${register}`);

    // Prepare environment variables for register_test.py
    const registerTestPath = path.join(__dirname, '../../register_test.py');
    
    // Parse register - support both hex (0x) and decimal
    let registerValue = parseInt(register);
    if (typeof register === 'string' && register.startsWith('0x')) {
      registerValue = parseInt(register, 16);
    }

    const env = {
      ...process.env,
      TEST_USB: port,
      MODBUS_SLAVE_ID: slaveId.toString(),
      INVERTER_BAUD_RATE: baudRate.toString(),
      TEST_REG: registerValue.toString(),
      TEST_BASE: '10',  // Input register in decimal
      SIGNED: signed.toString(),
      INVERTER_FUNCTION_CODE: functionCode.toString(),
      INVERTER_FUNCTION_CODE_BASE: functionCodeBase.toString()
    };

    // Spawn register_test.py
    const python = spawn('python3', [registerTestPath], { env });
    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (code === 0) {
        // Find the most recent test result file
        const testDataDir = '/collect_data/test';
        if (fs.existsSync(testDataDir)) {
          try {
            const files = fs.readdirSync(testDataDir)
              .filter(f => f.endsWith('.json'))
              .sort()
              .reverse();
            
            if (files.length > 0) {
              const resultFile = path.join(testDataDir, files[0]);
              const resultData = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
              
              return res.json({
                success: true,
                data: resultData.data,
                output: stdout,
                resultFile: resultFile,
                timestamp: parseInt(files[0].replace('.json', '')),
                metadata: {
                  port,
                  slaveId: parseInt(slaveId),
                  baudRate: parseInt(baudRate),
                  register: registerValue
                }
              });
            }
          } catch (err) {
            logger.error(`Failed to parse result file: ${err.message}`);
          }
        }

        // If we can't find result file, return stdout parsing
        return res.json({
          success: true,
          output: stdout,
          metadata: {
            port,
            slaveId: parseInt(slaveId),
            baudRate: parseInt(baudRate),
            register: registerValue
          }
        });
      } else {
        logger.error(`Modbus test failed: code=${code}, stderr=${stderr}`);
        return res.status(400).json({
          success: false,
          error: `Modbus test failed: ${stderr || 'Unknown error'}`,
          output: stdout,
          code
        });
      }
    });

  } catch (err) {
    logger.error(`Modbus test error: ${err.message}`);
    res.status(500).json({
      success: false,
      error: `Internal server error: ${err.message}`
    });
  }
});

module.exports = router;

import asyncio
import pymodbus.client as ModbusClient
from pymodbus import (
    FramerType,
    ModbusException,
    pymodbus_apply_logging_config,
)
import logging
from sys import stdout
import os
import time

# logger config
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)
logFormatter = logging.Formatter("%(name)-12s %(asctime)s %(levelname)-8s %(filename)s:%(funcName)s %(message)s")
consoleHandler = logging.StreamHandler(stdout)
consoleHandler.setFormatter(logFormatter)
logger.addHandler(consoleHandler)

async def write_register_async(register, value):
    """Use async client like the working config.py does."""
    try:
        # Initialize async Modbus client (matching working config.py)
        print(f"Initializing async Modbus client for register {register} with value {value}")
        pymodbus_apply_logging_config("DEBUG")
        
        client = ModbusClient.AsyncModbusSerialClient(
            port=os.getenv("TEST_USB"),
            framer=FramerType.RTU,
            baudrate=int(os.getenv("INVERTER_BAUD_RATE", "9600")),
            bytesize=8,
            parity="N",
            stopbits=1,
        )
        
        # Connect to device
        print("Connecting to device")
        await client.connect()
        if not client.connected:
            logger.error("Failed to connect to Modbus device")
            print("Write failed: Could not connect to device")
            return False
        
        # Write the register
        logger.info(f"Writing register 0x{register:x} with value {value}")
        write_response = await client.write_register(register, value)
        
        # Log response details
        logger.info(f"Write response: {write_response}")
        logger.info(f"Response type: {type(write_response)}")
        
        if write_response.isError():
            logger.error(f"Error writing register: {write_response}")
            print(f"Write failed: {write_response}")
            client.close()
            return False
        
        # Wait for device to process
        logger.info(f"Waiting for device to process write...")
        time.sleep(2)
        
        # Verify the write by reading back the register
        logger.info(f"Verifying write by reading register 0x{register:x} back from device")
        read_response = await client.read_holding_registers(address=register, count=1)
        
        if read_response.isError():
            logger.error(f"Error reading back register for verification: {read_response}")
            client.close()
            print(f"Write failed: Could not verify write - read error")
            return False
        
        # Check if read-back value matches what we wrote
        if hasattr(read_response, 'registers') and len(read_response.registers) > 0:
            readback_value = read_response.registers[0]
            logger.info(f"Read-back verification: wrote {value}, read back {readback_value}")
            
            if readback_value == value:
                logger.info(f"Write verification PASSED - value persisted on device")
                print(f"Write successful")
                client.close()
                return True
            else:
                logger.error(f"Write verification FAILED - value mismatch. Expected {value}, got {readback_value}")
                print(f"Write failed: Value mismatch on verification. Wrote {value} but device has {readback_value}")
                client.close()
                return False
        else:
            logger.error(f"Unexpected read response format: {read_response}")
            client.close()
            print(f"Write failed: Could not verify write - unexpected response")
            return False
    except Exception as e:
        logger.error(f"Write failed: {e}")
        print(f"Write failed: {e}")
        return False


if __name__ == "__main__":
    try:
        # Parse register and value from env vars
        test_reg = os.getenv("TEST_REG")
        test_base = os.getenv("TEST_BASE", "10")
        test_value = os.getenv("TEST_VALUE")
        
        if not test_reg or not test_value:
            print(f"Write failed: Missing TEST_REG or TEST_VALUE")
            exit(1)
        
        register = int(test_reg, int(test_base))
        value = int(test_value)
        
        # Run async function
        success = asyncio.run(write_register_async(register, value))
        exit(0 if success else 1)
    except Exception as e:
        print(f"Write failed: {e}")
        exit(1)

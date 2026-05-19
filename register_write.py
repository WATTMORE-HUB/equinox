import pymodbus.client as ModbusClient
from pymodbus import (
    FramerType,
    ModbusException,
    pymodbus_apply_logging_config,
)
import logging
from sys import stdout
import os

# logger config
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)
logFormatter = logging.Formatter("%(name)-12s %(asctime)s %(levelname)-8s %(filename)s:%(funcName)s %(message)s")
consoleHandler = logging.StreamHandler(stdout)
consoleHandler.setFormatter(logFormatter)
logger.addHandler(consoleHandler)

# Modbus Client Object
client: ModbusClient.ModbusBaseSyncClient
print("Set serial client")
client = ModbusClient.ModbusSerialClient(
    port=os.getenv("TEST_USB"),
    framer=FramerType.RTU,
    # timeout=10,
    # retries=3,
    baudrate=int(os.getenv("INVERTER_BAUD_RATE")),
    bytesize=8,
    parity="N",
    stopbits=1,
    # handle_local_echo=False,
)

def write_register(register, value):
    try:
        # Connect to device
        if not client.connect():
            logger.error("Failed to connect to Modbus device")
            print("Write failed: Could not connect to device")
            return False
        
        # Write the register
        data = client.write_register(register, value, unit=1)
        client.close()
        
        if data.isError():
            logger.error("Error writing register")
            print(f"Write failed: {data}")
            return False
        
        logger.info("Write successful")
        print("Write successful")
        return True
    except Exception as e:
        logger.error(f"Write failed: {e}")
        print(f"Write failed: {e}")
        return False


if __name__ == "__main__":
    write_register(int(os.getenv("TEST_REG"), int(os.getenv("TEST_BASE"))), int(os.getenv("TEST_VALUE")))

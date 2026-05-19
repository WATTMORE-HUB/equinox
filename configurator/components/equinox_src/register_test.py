import minimalmodbus
import asyncio
import pymodbus.client as ModbusClient
from pymodbus import (
    FramerType,
    ModbusException,
    pymodbus_apply_logging_config,
)
import logging
import json
from sys import stdout
from datetime import datetime
import time
import os

logger = logging.getLogger('collect')

logger.setLevel(logging.DEBUG)
logFormatter = logging.Formatter("%(name)-12s %(asctime)s %(levelname)-8s %(filename)s:%(funcName)s %(message)s")
consoleHandler = logging.StreamHandler(stdout)
consoleHandler.setFormatter(logFormatter)
logger.addHandler(consoleHandler)


def collect_data_mm(register, signed_yn):
    
    instrument = minimalmodbus.Instrument(os.getenv("TEST_USB"), int(os.getenv("MODBUS_SLAVE_ID")))  # Port, slave ID
    instrument.serial.baudrate = int(os.getenv("INVERTER_BAUD_RATE"))
    instrument.serial.bytesize = 8
    instrument.serial.parity   = minimalmodbus.serial.PARITY_NONE
    instrument.serial.stopbits = 1
    instrument.serial.timeout  = 2  # seconds
    instrument.mode = minimalmodbus.MODE_RTU
    instrument.byteorder = minimalmodbus.BYTEORDER_BIG
    instrument.debug = True
    inverter_function_code = int(os.getenv("INVERTER_FUNCTION_CODE"), int(os.getenv("INVERTER_FUNCTION_CODE_BASE")))
    
    def read_float(register, signed_yn):
        for attempt in range(3):
            try:
                if signed_yn == 1:
                    return instrument.read_float(register,
                                                functioncode=inverter_function_code,
                                                signed=True,
                                                number_of_registers=2)
                else:
                    return instrument.read_float(register,
                                                functioncode=inverter_function_code,
                                                number_of_registers=2)
            except Exception as e:
                if attempt < 2:
                    logger.warning(f"Attempt {attempt + 1} failed for register {register}: {e}")
                    time.sleep(0.1)  # Wait before retry
                else:
                    logger.error(f"All 3 attempts failed for register {register}: {e}")
                    return "NULL"

    def read_long(register, signed_yn):
        for attempt in range(3):
            try:
                if signed_yn == 1:
                    return instrument.read_long(register,
                                                functioncode=inverter_function_code,
                                                signed=True,
                                                byteorder=0,
                                                number_of_registers=2)
                else:
                    return instrument.read_long(register,
                                                functioncode=inverter_function_code,
                                                byteorder=0,
                                                number_of_registers=2)
            except Exception as e:
                if attempt < 2:
                    logger.warning(f"Attempt {attempt + 1} failed for register {register}: {e}")
                    time.sleep(0.1)  # Wait before retry
                else:
                    logger.error(f"All 3 attempts failed for register {register}: {e}")
                    return "NULL"

    def read_int(register, signed_yn):
        for attempt in range(3):
            try:
                if signed_yn == 1:
                    return instrument.read_register(register, functioncode=inverter_function_code, signed=True)
                else:
                    return instrument.read_register(register, functioncode=inverter_function_code)
            except Exception as e:
                if attempt < 2:
                    logger.warning(f"Attempt {attempt + 1} failed for register {register}: {e}")
                    time.sleep(0.1)  # Wait before retry
                else:
                    logger.error(f"All 3 attempts failed for register {register}: {e}")
                    return "NULL"

    try:
        # 16 bit registers only for now
        print("Register to test: " + str(register))
        try:
            data = read_float(register, signed_yn)
        except Exception as e:
            print("32 bit float read failed:", e)
            data = "Invalid register"
        try:
            data2 = read_int(register, signed_yn)
        except Exception as e:
            print("16 bit read failed:", e)
            data2 = "Invalid register"
        try:
            data3 = read_long(register, signed_yn)
        except Exception as e:
            print("32 bit INT read failed:", e)
            data3 = "Invalid register"
        poll_data = {"Test Register": register, "32 bit float data": data, "16 bit int data": data2, "32 bit int data": data3, "signed": signed_yn}
        print(poll_data)
        collected_data = {"data": poll_data}
        curr_time = datetime.now()
        timestamp = int(curr_time.timestamp())
        os.makedirs("/collect_data/test", exist_ok=True)
        with open(f"/collect_data/test/{timestamp}.json", 'w') as json_file:
            json.dump(collected_data, json_file, indent=4)
    except Exception as e:
        print("Read failed:", e)

if __name__ == "__main__":

    logger.info("Test single register begin")
    # print(ip_address)
    collect_data_mm(int(os.getenv("TEST_REG"), int(os.getenv("TEST_BASE"))), int(os.getenv("SIGNED")))
    # for x in range(0, 7):
    #     collect_data_mm(x)
    #     time.sleep(2)
    
    # logger.info("Config starting")
    # for x in range(40000, 40200):
    # asyncio.run(
    #         collect_data_pymodbus(os.getenv("USB1")), debug=True)
    #         # collect_data_tcp(ip_address, int(os.getenv("TEST_REG")))
    #      )
    logger.info("Test finished")
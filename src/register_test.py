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

ip_address = "192.168.1.12"

async def collect_data_pymodbus(port, framer=FramerType.RTU):
    """Run async client."""
    # activate debugging
    pymodbus_apply_logging_config("DEBUG")
    
    print("get client")
    client: ModbusClient.ModbusBaseClient
    print("Set serial client")
    client = ModbusClient.AsyncModbusSerialClient(
        port,
        framer=framer,
        # timeout=10,
        # retries=3,
        baudrate=9600,
        bytesize=8,
        parity="N",
        stopbits=1,
        # handle_local_echo=False,
    )
    print("connect to server")
    await client.connect()
    # test client is connected
    # assert client.connected
    print("get and verify data")
    
    # remove try/except since it's tested
    register1 = await client.read_holding_registers(0x20E, count=2, slave=20)
    register1_data = client.convert_from_registers(register1.registers,
                                             data_type=client.DATATYPE.FLOAT32)
    register2 = await client.read_holding_registers(0x220, count=2, slave=20)
    register2_data = client.convert_from_registers(register2.registers,
                                             data_type=client.DATATYPE.FLOAT32)
    register3 = await client.read_holding_registers(0x232, count=2, slave=20)
    register3_data = client.convert_from_registers(register3.registers,
                                             data_type=client.DATATYPE.FLOAT32)
    register4 = await client.read_holding_registers(0x1100, count=2, slave=20)
    register4_data = client.convert_from_registers(register4.registers,
                                             data_type=client.DATATYPE.FLOAT32)
    collected_data = [register1_data, register2_data, register3_data, register4_data]
    client.close()
    collected_data = {"data from registers": collected_data}
    curr_time = datetime.now()
    #timestamp = int(round(curr_time.timestamp()))
    timestamp = int(curr_time.timestamp())
    
    with open("/collect_data/pymodbus_test.json", 'w') as json_file:
        json.dump(collected_data, json_file, indent=4)    

async def collect_data_tcp(host, framer=FramerType.SOCKET):
        """Run async client."""
        # activate debugging
        pymodbus_apply_logging_config("DEBUG")
        
        print("get client")
        client: ModbusClient.ModbusBaseClient
        print("Set serial client")
        client = ModbusClient.AsyncModbusTcpClient(
            host,
            port=502,
            framer=framer,
            # timeout=10,
            # retries=3,
            # source_address=("localhost", 0),
    )
        print("connect to server")
        await client.connect()
        # test client is connected
        # assert client.connected
        print("get and verify data")
        
        # remove try/except since it's tested
        register1 = await client.read_holding_registers(1220, count=1)
        register1_data = client.convert_from_registers(register1.registers,
                                                 data_type=client.DATATYPE.INT16)
        # register2 = await client.read_holding_registers(0x220, count=2)
        # register2_data = client.convert_from_registers(register2.registers,
        #                                          data_type=client.DATATYPE.FLOAT32)
        # register3 = await client.read_holding_registers(0x232, count=2)
        # register3_data = client.convert_from_registers(register3.registers,
        #                                          data_type=client.DATATYPE.FLOAT32)
        # register4 = await client.read_holding_registers(0x1100, count=2)
        # register4_data = client.convert_from_registers(register4.registers,
        #                                          data_type=client.DATATYPE.FLOAT32)
        collected_data = [register1_data]
        client.close()
        collected_data = {"data from registers": collected_data}
        curr_time = datetime.now()
        #timestamp = int(round(curr_time.timestamp()))
        timestamp = int(curr_time.timestamp())
        
        with open("/collect_data/pymodbus_test.json", 'w') as json_file:
            json.dump(collected_data, json_file, indent=4)    

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
            if signed_yn == 1:
                return instrument.read_float(register,
                                             functioncode=inverter_function_code,
                                             signed=True,
                                             number_of_registers=2)
            else:
                return instrument.read_float(register,
                                             functioncode=inverter_function_code,
                                             number_of_registers=2)

        def read_long(register, signed_yn):
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

        def read_int(register, signed_yn):
            if signed_yn == 1:
                return instrument.read_register(register, functioncode=inverter_function_code, signed=True)
            else:
                return instrument.read_register(register, functioncode=inverter_function_code)

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
    
    # Use minimalmodbus with serial port from environment
    test_reg = int(os.getenv("TEST_REG"), int(os.getenv("TEST_BASE")))
    signed = int(os.getenv("SIGNED"))
    collect_data_mm(test_reg, signed)
    
    logger.info("Test finished")

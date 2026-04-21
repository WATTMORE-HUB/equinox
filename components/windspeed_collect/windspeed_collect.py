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

ip_address = "192.168.13.100"

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
        
        try:
            first_reading = await client.read_holding_registers(0, count=1, slave=1)
            first_reading_data = client.convert_from_registers(first_reading.registers,
                                                     data_type=client.DATATYPE.INT16)
            time.sleep(5)
            
            second_reading = await client.read_holding_registers(0, count=1, slave=1)
            second_reading_data = client.convert_from_registers(second_reading.registers,
                                                     data_type=client.DATATYPE.INT16)
            
            wind_speed = (abs((second_reading_data - first_reading_data))/5)*1.492
        except Exception as e:
            logger.error(e)
            wind_speed = "NULL"
        
        client.close()
        collected_data = {"first reading": first_reading_data, "second reading": second_reading_data, "wind_speed": wind_speed}
        
        poll_data = {
            "device_readable_name": [os.getenv("WEATHER_READABLE_NAME_2"), "DIMENSION"],
            "device_id": [os.getenv("WEATHER_DEVICE_ID_2"), "DIMENSION"],
            "device_model": [os.getenv("WEATHER_DEVICE_MODEL_2"), "DIMENSION"],
            "site_id": [os.getenv('SITE_ID'), "DIMENSION"],
            "edge_id": [os.getenv('EDGE_ID'), "DIMENSION"],
            "ambient_air_temperature": ["NULL", "DOUBLE"],
            "rain": ["NULL", "DOUBLE"],
            "direct_horizontal_irradiance": ["NULL", "DOUBLE"],
            "bar_pr": ["NULL", "DOUBLE"],
            "sol_zenith_angle": ["NULL", "DOUBLE"],
            "insolation_dni": ["NULL", "DOUBLE"],
            "wind_dir": ["NULL", "DOUBLE"],
            "insolation_poa": ["NULL", "DOUBLE"],
            "front_of_temperature_pv": ["NULL", "DOUBLE"],
            "insolation_dhi": ["NULL", "DOUBLE"],
            "insolation_ghi": ["NULL", "DOUBLE"],
            "global_horizontal_irradiance": ["NULL", "DOUBLE"],
            "humidity": ["NULL", "DOUBLE"],
            "wind_speed": [wind_speed, "DOUBLE"],
            "diffuse_horizontal_irradiance": ["NULL", "DOUBLE"],
            "direct_normal_irradiance": ["NULL", "DOUBLE"],
            "plane_of_array_irradiance": ["NULL", "DOUBLE"],
            "back_of_temperature_pv": ["NULL", "DOUBLE"]
        }
        
        curr_time = datetime.now()
        #timestamp = int(round(curr_time.timestamp()))
        timestamp = int(datetime.now().timestamp()*1000)
        os.makedirs("/collect_data/weather", exist_ok=True)
        with open(f"/collect_data/weather/{timestamp}.json", 'w') as json_file:
            json.dump(poll_data, json_file, indent=4)    


if __name__ == "__main__":

    logger.info("Test single register begin")
    print(ip_address)
    while True:
        try:
            asyncio.run(
                    # collect_data_pymodbus(os.getenv("USB1")), debug=True)
                    collect_data_tcp(ip_address)
                )
            logger.info("Test finished")
        except Exception as e:
            logger.error(e)
        time.sleep(30)


import minimalmodbus
import logging
import json
from sys import stdout
from datetime import datetime, timezone
import time
import os
import math

logger = logging.getLogger('collect')

logger.setLevel(logging.DEBUG)
logFormatter = logging.Formatter("%(name)-12s %(asctime)s %(levelname)-8s %(filename)s:%(funcName)s %(message)s")
consoleHandler = logging.StreamHandler(stdout)
consoleHandler.setFormatter(logFormatter)
logger.addHandler(consoleHandler)

# for register processing
base                                    = int(os.getenv("WEATHER_REGISTER_BASE")) # 10

# for temp calcs
temp_type                               = os.getenv("WEATHER_TEMP_TYPE")


# modbus identification
weather_modbus_slave_ids                = os.getenv("WEATHER_MODBUS_SLAVE_IDS")
weather_ids                             = os.getenv("WEATHER_ID_LIST")

# for modbus connection init
weather_function_code                   = int(os.getenv("WEATHER_FUNCTION_CODE"))
weather_baud_rate                       = int(os.getenv("WEATHER_BAUD_RATE"))

# registers, data sizes, scales
ambient_air_temperature_reg             = int(os.getenv("WEATHER_AMBIENT_AIR_TEMPERATURE_REG"), base)  # 0
ambient_air_temperature_data_size       = int(os.getenv("WEATHER_AMBIENT_AIR_TEMPERATURE_DATA_SIZE"))  # 3232
ambient_air_temperature_scale           = int(os.getenv("WEATHER_AMBIENT_AIR_TEMPERATURE_SCALE"))  #.001


direct_horizontal_irradiance_reg        = int(os.getenv("WEATHER_DIRECT_HORIZONTAL_IRRADIANCE_REG"), base)  # 99999
direct_horizontal_irradiance_data_size  = int(os.getenv("WEATHER_DIRECT_HORIZONTAL_IRRADIANCE_DATA_SIZE"))  # 3232
direct_horizontal_irradiance_scale      = int(os.getenv("WEATHER_DIRECT_HORIZONTAL_IRRADIANCE_SCALE"))  #.001

wind_dir_reg                            = int(os.getenv("WEATHER_WIND_DIR_REG"), base) # 12
wind_dir_data_size                      = int(os.getenv("WEATHER_WIND_DIR_DATA_SIZE")) # 3232
wind_dir_scale                          = int(os.getenv("WEATHER_WIND_DIR_SCALE")) #.001


global_horizontal_irradiance_reg        = int(os.getenv("WEATHER_GLOBAL_HORIZONTAL_IRRADIANCE_REG"), base) # 99999
global_horizontal_irradiance_data_size  = int(os.getenv("WEATHER_GLOBAL_HORIZONTAL_IRRADIANCE_DATA_SIZE")) # 3232
global_horizontal_irradiance_scale      = int(os.getenv("WEATHER_GLOBAL_HORIZONTAL_IRRADIANCE_SCALE")) #.001


plane_of_array_irradiance_reg           = int(os.getenv("WEATHER_PLANE_OF_ARRAY_IRRADIANCE_REG"), base) # 99999
plane_of_array_irradiance_data_size     = int(os.getenv("WEATHER_PLANE_OF_ARRAY_IRRADIANCE_DATA_SIZE")) # 3232
plane_of_array_irradiance_scale         = int(os.getenv("WEATHER_PLANE_OF_ARRAY_IRRADIANCE_SCALE")) #.001

back_of_temperature_pv_reg              = int(os.getenv("WEATHER_BACK_OF_TEMPERATURE_PV_REG"), base) # 99999
back_of_temperature_pv_data_size        = int(os.getenv("WEATHER_BACK_OF_TEMPERATURE_PV_DATA_SIZE")) # 3232
back_of_temperature_pv_scale            = int(os.getenv("WEATHER_BACK_OF_TEMPERATURE_PV_SCALE")) #.001


def irradiance_calc(raw, constant):
    if raw == "NULL":
        return "NULL"
    else:
        print(raw)
        v = (raw * 0.00229)*1000
        return v/constant


def temp_calc(raw, min, range):
    if raw == "NULL":
        return "NULL"
    else:
        tc = min + ((raw/65535) * range)
        tf = tc * (9/5) + 32
        if temp_type == "F":
            return tf
        else:
            return tc


def wind_direction_calc(raw):
    if raw == "NULL":
        return "NULL"
    else:
        v = (raw + 32768) * 0.00007629
        d = (v / 5.0) * 360.0
        return d


def collect_data(modbus_slave_id, device_id_env):

    instrument = minimalmodbus.Instrument(os.getenv("USB_WEATHER"), modbus_slave_id)  # Port, slave ID
    instrument.serial.baudrate = weather_baud_rate
    instrument.serial.bytesize = 8
    instrument.serial.parity   = minimalmodbus.serial.PARITY_NONE
    instrument.serial.stopbits = 1
    instrument.serial.timeout  = 1  # seconds
    instrument.mode = minimalmodbus.MODE_RTU

    # def read_register(register, function_code, data_size):
    #     try:
    #         data = instrument.read_register(register,
    #                                         functioncode=weather_function_code,
    #                                         signed=False)
    #         return data
    #     except Exception as e:
    #         logger.info(e)
    #         return "NULL"
            
    def read_register(register, function_code, data_size):
        for attempt in range(5):
            try:
                data = instrument.read_register(register,
                                                functioncode=weather_function_code)
                time.sleep(0.05)
                return data
            except Exception as e:
                if attempt < 4:
                    logger.warning(f"Attempt {attempt + 1} failed for register {register}: {e}")
                    time.sleep(0.1)  # Wait before retry
                else:
                    logger.error(f"All 3 attempts failed for register {register}: {e}")
                    return "NULL"

    # Use the following prints as debugging for specific sensor calibration tests
   
    # print("Albedo")
    # print(direct_horizontal_irradiance_reg)
    # print(weather_function_code)
    # print(direct_horizontal_irradiance_data_size)
    # print(direct_horizontal_irradiance_scale)
    # print(read_register(direct_horizontal_irradiance_reg, weather_function_code, direct_horizontal_irradiance_data_size, direct_horizontal_irradiance_scale))
    # print(irradiance_calc(read_register(direct_horizontal_irradiance_reg, weather_function_code, direct_horizontal_irradiance_data_size, direct_horizontal_irradiance_scale), 9.16))
    # 
    # print("GHI")
    # print(global_horizontal_irradiance_reg)
    # print(weather_function_code)
    # print(global_horizontal_irradiance_data_size)
    # print(global_horizontal_irradiance_scale)
    # print(read_register(global_horizontal_irradiance_reg, weather_function_code, global_horizontal_irradiance_data_size, global_horizontal_irradiance_scale))
    # print(irradiance_calc(read_register(global_horizontal_irradiance_reg, weather_function_code, global_horizontal_irradiance_data_size, global_horizontal_irradiance_scale), 10.44))
    # 
    # print("POA")
    # print(read_register(plane_of_array_irradiance_reg, weather_function_code, plane_of_array_irradiance_data_size, plane_of_array_irradiance_scale))
    # print(irradiance_calc(read_register(plane_of_array_irradiance_reg, weather_function_code, plane_of_array_irradiance_data_size, plane_of_array_irradiance_scale), 9.22))
    # print("Here are the temp readings:")
    # print(read_register(ambient_air_temperature_reg, weather_function_code, ambient_air_temperature_data_size))
    # print(read_register(back_of_temperature_pv_reg, weather_function_code, back_of_temperature_pv_data_size))
    try:
        poll_data = {
            "device_readable_name": [os.getenv("WEATHER_READABLE_NAME"), "DIMENSION"],
            "device_id": [device_id_env, "DIMENSION"],
            "device_model": [os.getenv("WEATHER_DEVICE_MODEL"), "DIMENSION"],
            "site_id": [os.getenv('SITE_ID'), "DIMENSION"],
            "edge_id": [os.getenv('EDGE_ID'), "DIMENSION"],
            "ambient_air_temperature": [temp_calc(read_register(ambient_air_temperature_reg, weather_function_code, ambient_air_temperature_data_size), -29, 78), "DOUBLE"],
            "rain": ["NULL", "DOUBLE"],
            "albedo": ["NULL", "DOUBLE"],
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
            "wind_speed": ["NULL", "DOUBLE"],
            "diffuse_horizontal_irradiance": ["NULL", "DOUBLE"],
            "direct_normal_irradiance": ["NULL", "DOUBLE"],
            "plane_of_array_irradiance": [irradiance_calc(read_register(plane_of_array_irradiance_reg, weather_function_code, plane_of_array_irradiance_data_size), 13.60), "DOUBLE"],
            "back_of_temperature_pv": [temp_calc(read_register(back_of_temperature_pv_reg, weather_function_code, back_of_temperature_pv_data_size), -40, 125), "DOUBLE"]
        }
        
        collected_data = poll_data
        timestamp = int(datetime.now().timestamp()*1000)
        os.makedirs("/collect_data/weather", exist_ok=True)
        with open(f"/collect_data/weather/{timestamp}.json", 'w') as json_file:
            json.dump(collected_data, json_file, indent=4)
    except Exception as e:
        print("Read failed:", e)


if __name__ == "__main__":
    # primary loop
    time.sleep(10)
    weather_stations = weather_modbus_slave_ids.split(",")
    device_ids = weather_ids.split(", ")
    print("Inverters")
    print(weather_stations)
    while True:
        try:
            for x in weather_stations:
                try:
                    logger.info("Main loop begin")
                    collect_data(int(x), device_ids[weather_stations.index(x)])
                    logger.info("Loop finished")
                except Exception as e:
                    logger.error(e)
        except Exception as e:
            logger.error(e)
        time.sleep(30)

import minimalmodbus
import pymodbus.client as ModbusClient
from pymodbus import (
    FramerType,
    ModbusException,
    pymodbus_apply_logging_config,
)
import logging
import json
from sys import stdout
from datetime import datetime, timezone
import time
import os

logger = logging.getLogger('collect')

logger.setLevel(logging.DEBUG)
logFormatter = logging.Formatter("%(name)-12s %(asctime)s %(levelname)-8s %(filename)s:%(funcName)s %(message)s")
consoleHandler = logging.StreamHandler(stdout)
consoleHandler.setFormatter(logFormatter)
logger.addHandler(consoleHandler)

# ip for TCP devices (0.0.0.0 for no TCP)
ip_part_1 = int(os.getenv("IP_PART_1"))
ip_part_2 = int(os.getenv("IP_PART_2"))
ip_part_3 = int(os.getenv("IP_PART_3"))
ip_part_4 = int(os.getenv("IP_PART_4"))
modbus_ip_address = f"{ip_part_1}.{ip_part_2}.{ip_part_3}.{ip_part_4}"

# for RTU vs TCP distinction
modbus_mode = os.getenv("MODBUS_MODE")

# for register processing
base = int(os.getenv("REGISTER_BASE"))

# for modbus connection init
function_code = int(os.getenv("FUNCTION_CODE"))

# for result scaling
m_power_scale      = float(os.getenv("M_POWER_SCALE"))
m_volt_scale       = float(os.getenv("M_VOLT_SCALE"))
m_current_scale    = float(os.getenv("M_CURRENT_SCALE"))
m_energy_sum_scale = float(os.getenv("M_ENERGY_SUM_SCALE"))
m_frequency_scale  = float(os.getenv("M_FREQUENCY_SCALE"))




def collect_data(powerA_reg,
                 powerB_reg,
                 powerC_reg,
                 voltA_reg,
                 voltB_reg,
                 voltC_reg,
                 currentA_reg,
                 currentB_reg,
                 currentC_reg,
                 energySum_reg,
                 freq_reg,
                 serial_reg):
    if modbus_mode == "RTU":
        # Create Modbus RTU instrument
        instrument = minimalmodbus.Instrument(os.getenv("USB"), 1)  # Port, slave ID
        instrument.serial.baudrate = 9600
        instrument.serial.bytesize = 8
        instrument.serial.parity   = minimalmodbus.serial.PARITY_NONE
        instrument.serial.stopbits = 1
        instrument.serial.timeout  = 1  # seconds
        instrument.mode = minimalmodbus.MODE_RTU

        def read_float(register, function_code):
            try:
                return instrument.read_float(register,
                                             functioncode=function_code,
                                             number_of_registers=2)
            except Exception as e:
                logger.info(e)
                return 0

        def read_int(register, function_code):
            try:
                return instrument.read_register(register,
                                                functioncode=function_code)
            except Exception as e:
                logger.info(e)
                return 0

        try:
    
            # powerA = read_float(powerA_reg, function_code)
            # powerB = read_float(powerB_reg, function_code)
            # powerC = read_float(powerC_reg, function_code)
            voltA = read_float(voltA_reg, function_code)
            voltB = read_float(voltB_reg, function_code)
            voltC = read_float(voltC_reg, function_code)
            currentA = read_float(currentA_reg, function_code)
            currentB = read_float(currentB_reg, function_code)
            currentC = read_float(currentC_reg, function_code)
            powerA = voltA * currentA
            powerB = voltB * currentB
            powerC = voltC * currentC
            energySum = read_float(energySum_reg, function_code)
            frequency = read_float(freq_reg, function_code)
            serial = read_int(serial_reg, function_code)
    
            poll_data = {"power_a": f"{powerA*.001:.2f}",
                         "power_b": f"{powerB*.001:.2f}",
                         "power_c": f"{powerC*.001:.2f}",
                         "volt_a": f"{voltA*m_volt_scale:.2f}",
                         "volt_b": f"{voltB*m_volt_scale:.2f}",
                         "volt_c": f"{voltC*m_volt_scale:.2f}",
                         "current_a": f"{currentA*m_current_scale:.2f}",
                         "current_b": f"{currentB*m_current_scale:.2f}",
                         "current_c": f"{currentC*m_current_scale:.2f}",
                         "energy_sum": f"{energySum*m_energy_sum_scale:.2f}",
                         "frequency": f"{frequency*m_frequency_scale:.2f}",
                         "device_id": os.getenv("DEVICE_ID"),
                         "device_readable_name": os.getenv("DEVICE_READABLE_NAME"),
                         "site_id": os.getenv("SITE"),
                         "edge_id": os.getenv("EDGE_ID"),
                         "device_model": os.getenv("DEVICE_MODEL")
                         }
    
            collected_data = poll_data
            timestamp = int(datetime.now().timestamp()*1000)
            os.makedirs("/collect_data/meter", exist_ok=True)
            with open(f"/collect_data/meter/{timestamp}.json", 'w') as json_file:
                json.dump(collected_data, json_file, indent=4)
        except Exception as e:
            print("Read failed:", e)
    elif modbus_mode == "TCP":
        # create Modbus TCP client
        client: ModbusClient.ModbusBaseSyncClient
        client = ModbusClient.ModbusTcpClient(
            host=modbus_ip_address,
            port="502",
            framer=FramerType.SOCKET,
            # timeout=10,
            # retries=3,
            # source_address=("localhost", 0),
        )
        client.connect()
        
        def read_float_tcp(register):
            try:
                register_data = client.read_holding_registers(register, count=2)
                return client.convert_from_registers(register_data.registers, data_type=client.DATATYPE.FLOAT32)
            except Exception as e:
                logger.info(e)
                return 0
        
        def read_int_tcp(register):
            try:
                register_data = client.read_holding_registers(register, count=1)
                return client.convert_from_registers(register_data.registers, data_type=client.DATATYPE.INT16)
            except Exception as e:
                logger.info(e)
                return 0
        
        try:
        
            powerA = read_float_tcp(powerA_reg)
            powerB = read_float_tcp(powerB_reg)
            powerC = read_float_tcp(powerC_reg)
            voltA = read_float_tcp(voltA_reg)
            voltB = read_float_tcp(voltB_reg)
            voltC = read_float_tcp(voltC_reg)
            currentA = read_float_tcp(currentA_reg)
            currentB = read_float_tcp(currentB_reg)
            currentC = read_float_tcp(currentC_reg)
            energySum = read_float_tcp(energySum_reg)
            frequency = read_float_tcp(freq_reg)
            serial = read_int_tcp(serial_reg)
            
            client.close()
            
            poll_data = {"power_a": f"{powerA*m_power_scale:.2f}",
                         "power_b": f"{powerB*m_power_scale:.2f}",
                         "power_c": f"{powerC*m_power_scale:.2f}",
                         "volt_a": f"{voltA*m_volt_scale:.2f}",
                         "volt_b": f"{voltB*m_volt_scale:.2f}",
                         "volt_c": f"{voltC*m_volt_scale:.2f}",
                         "current_a": f"{currentA*m_current_scale:.2f}",
                         "current_b": f"{currentB*m_current_scale:.2f}",
                         "current_c": f"{currentC*m_current_scale:.2f}",
                         "energy_sum": f"{energySum*m_energy_sum_scale:.2f}",
                         "frequency": f"{frequency*m_frequency_scale:.2f}",
                         "device_id": os.getenv("METER_DEVICE_ID"),
                         "device_readable_name": os.getenv("DEVICE_READABLE_NAME"),
                         "site_id": os.getenv("SITE"),
                         "edge_id": os.getenv("EDGE_ID"),
                         "device_model": os.getenv("DEVICE_MODEL")
                         }
        
            collected_data = poll_data
            timestamp = int(datetime.now().timestamp()*1000)
            os.makedirs("/collect_data/meter", exist_ok=True)
            with open(f"/collect_data/meter/{timestamp}.json", 'w') as json_file:
                json.dump(collected_data, json_file, indent=4)
        except Exception as e:
            print("Read failed:", e)
        


if __name__ == "__main__":
    # primary loop
    time.sleep(11)
    while True:
        try:
            logger.info("Main loop begin")
            collect_data(int(os.getenv("POW_A"), base),
                         int(os.getenv("POW_B"), base),
                         int(os.getenv("POW_C"), base),
                         int(os.getenv("VOLT_A"), base),
                         int(os.getenv("VOLT_B"), base),
                         int(os.getenv("VOLT_C"), base),
                         int(os.getenv("CURR_A"), base),
                         int(os.getenv("CURR_B"), base),
                         int(os.getenv("CURR_C"), base),
                         int(os.getenv("EN_SUM"), base),
                         int(os.getenv("FREQ"), base),
                         int(os.getenv("SERIAL"), base))
            logger.info("Loop finished")
        except Exception as e:
            logger.error(e)
        time.sleep(30)


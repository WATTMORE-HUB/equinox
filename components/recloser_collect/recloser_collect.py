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


# recloser variables
current_phase_a    = int(os.getenv("RECLOSER_CURRENT_PHASE_A"))
current_phase_b    = int(os.getenv("RECLOSER_CURRENT_PHASE_B"))
current_phase_c    = int(os.getenv("RECLOSER_CURRENT_PHASE_C"))
current_calculated = int(os.getenv("RECLOSER_CURRENT_CALCULATED"))
current_neutral    = int(os.getenv("RECLOSER_CURRENT_NEUTRAL"))
voltage_phase_a    = int(os.getenv("RECLOSER_VOLTAGE_PHASE_A"))
voltage_phase_b    = int(os.getenv("RECLOSER_VOLTAGE_PHASE_B"))
voltage_phase_c    = int(os.getenv("RECLOSER_VOLTAGE_PHASE_C"))
voltage_a_neutral  = int(os.getenv("RECLOSER_VOLTAGE_A_NEUTRAL"))
voltage_b_neutral  = int(os.getenv("RECLOSER_VOLTAGE_B_NEUTRAL"))
voltage_c_neutral  = int(os.getenv("RECLOSER_VOLTAGE_C_NEUTRAL"))
power_real         = int(os.getenv("RECLOSER_POWER_REAL"))
power_reactive     = int(os.getenv("RECLOSER_POWER_REACTIVE"))
power_factor       = int(os.getenv("RECLOSER_POWER_FACTOR"))
frequency          = int(os.getenv("RECLOSER_FREQUENCY"))
voltage_battery    = int(os.getenv("RECLOSER_VOLTAGE_BATTERY"))
energy_import      = int(os.getenv("RECLOSER_ENERGY_IMPORT"))
energy_export      = int(os.getenv("RECLOSER_ENERGY_EXPORT"))
energy_total       = int(os.getenv("RECLOSER_ENERGY_TOTAL"))

current_phase_a_data_size    = int(os.getenv("RECLOSER_CURRENT_PHASE_A_DATA_SIZE"))
current_phase_b_data_size    = int(os.getenv("RECLOSER_CURRENT_PHASE_B_DATA_SIZE"))
current_phase_c_data_size    = int(os.getenv("RECLOSER_CURRENT_PHASE_C_DATA_SIZE"))
current_calculated_data_size = int(os.getenv("RECLOSER_CURRENT_CALCULATED_DATA_SIZE"))
current_neutral_data_size    = int(os.getenv("RECLOSER_CURRENT_NEUTRAL_DATA_SIZE"))
voltage_phase_a_data_size    = int(os.getenv("RECLOSER_VOLTAGE_PHASE_A_DATA_SIZE"))
voltage_phase_b_data_size    = int(os.getenv("RECLOSER_VOLTAGE_PHASE_B_DATA_SIZE"))
voltage_phase_c_data_size    = int(os.getenv("RECLOSER_VOLTAGE_PHASE_C_DATA_SIZE"))
voltage_a_neutral_data_size  = int(os.getenv("RECLOSER_VOLTAGE_A_NEUTRAL_DATA_SIZE"))
voltage_b_neutral_data_size  = int(os.getenv("RECLOSER_VOLTAGE_B_NEUTRAL_DATA_SIZE"))
voltage_c_neutral_data_size  = int(os.getenv("RECLOSER_VOLTAGE_C_NEUTRAL_DATA_SIZE"))
power_real_data_size         = int(os.getenv("RECLOSER_POWER_REAL_DATA_SIZE"))
power_reactive_data_size     = int(os.getenv("RECLOSER_POWER_REACTIVE_DATA_SIZE"))
power_factor_data_size       = int(os.getenv("RECLOSER_POWER_FACTOR_DATA_SIZE"))
frequency_data_size          = int(os.getenv("RECLOSER_FREQUENCY_DATA_SIZE"))
voltage_battery_data_size    = int(os.getenv("RECLOSER_VOLTAGE_BATTERY_DATA_SIZE"))
energy_import_data_size      = int(os.getenv("RECLOSER_ENERGY_IMPORT_DATA_SIZE"))
energy_export_data_size      = int(os.getenv("RECLOSER_ENERGY_EXPORT_DATA_SIZE"))
energy_total_data_size       = int(os.getenv("RECLOSER_ENERGY_TOTAL_DATA_SIZE"))

current_phase_a_scale    = float(os.getenv("RECLOSER_CURRENT_PHASE_A_SCALE"))
current_phase_b_scale    = float(os.getenv("RECLOSER_CURRENT_PHASE_B_SCALE"))
current_phase_c_scale    = float(os.getenv("RECLOSER_CURRENT_PHASE_C_SCALE"))
current_calculated_scale = float(os.getenv("RECLOSER_CURRENT_CALCULATED_SCALE"))
current_neutral_scale    = float(os.getenv("RECLOSER_CURRENT_NEUTRAL_SCALE"))
voltage_phase_a_scale    = float(os.getenv("RECLOSER_VOLTAGE_PHASE_A_SCALE"))
voltage_phase_b_scale    = float(os.getenv("RECLOSER_VOLTAGE_PHASE_B_SCALE"))
voltage_phase_c_scale    = float(os.getenv("RECLOSER_VOLTAGE_PHASE_C_SCALE"))
voltage_a_neutral_scale  = float(os.getenv("RECLOSER_VOLTAGE_A_NEUTRAL_SCALE"))
voltage_b_neutral_scale  = float(os.getenv("RECLOSER_VOLTAGE_B_NEUTRAL_SCALE"))
voltage_c_neutral_scale  = float(os.getenv("RECLOSER_VOLTAGE_C_NEUTRAL_SCALE"))
power_real_scale         = float(os.getenv("RECLOSER_POWER_REAL_SCALE"))
power_reactive_scale     = float(os.getenv("RECLOSER_POWER_REACTIVE_SCALE"))
power_factor_scale       = float(os.getenv("RECLOSER_POWER_FACTOR_SCALE"))
frequency_scale          = float(os.getenv("RECLOSER_FREQUENCY_SCALE"))
voltage_battery_scale    = float(os.getenv("RECLOSER_VOLTAGE_BATTERY_SCALE"))
energy_import_scale      = float(os.getenv("RECLOSER_ENERGY_IMPORT_SCALE"))
energy_export_scale      = float(os.getenv("RECLOSER_ENERGY_EXPORT_SCALE"))
energy_total_scale       = float(os.getenv("RECLOSER_ENERGY_TOTAL_SCALE"))



def collect_data_tcp(host, port, framer=FramerType.SOCKET):
    """Run async client."""
    # activate debugging
    pymodbus_apply_logging_config("DEBUG")
    
    print("get client")
    client: ModbusClient.ModbusBaseSyncClient
    client = ModbusClient.ModbusTcpClient(
        host,
        port=port,
        framer=FramerType.SOCKET,
        # timeout=10,
        # retries=3,
        # source_address=("localhost", 0),
        )
    print("connect to server")
    client.connect()
    # test client is connected
    # assert client.connected
    print("get and verify data")

    def read_register(register, data_size, scale):
        if data_size == 16:
            try:
                register_data = client.read_holding_registers(register, count=1)
                unscaled_data = client.convert_from_registers(register_data.registers, data_type=client.DATATYPE.INT16)
                scaled_data = unscaled_data * scale
                return scaled_data
            except Exception as e:
                logger.info(e)
                return 0
        elif data_size == 32:
            try:
                register_data = client.read_holding_registers(register, count=2)
                unscaled_data = client.convert_from_registers(register_data.registers, data_type=client.DATATYPE.INT32)
                scaled_data = unscaled_data * scale
                return scaled_data
            except Exception as e:
                logger.info(e)
                return 0
    
    # these have to be pulled before serialization for the energy_total_data calc
    energy_import_data = read_register(energy_import, energy_import_data_size, energy_import_scale)
    energy_export_data = read_register(energy_export, energy_export_data_size, energy_export_scale)
    energy_total_data = energy_import_data + energy_export_data
    
    collected_data = {
                        "current_phase_a": f"{read_register(current_phase_a, current_phase_a_data_size, current_phase_a_scale)}",
                        "current_phase_b": f"{read_register(current_phase_b, current_phase_b_data_size, current_phase_b_scale)}",
                        "current_phase_c": f"{read_register(current_phase_c, current_phase_c_data_size, current_phase_c_scale)}",
                        "current_calculated": f"{read_register(current_calculated, current_calculated_data_size, current_calculated_scale)}",
                        "current_neutral": f"{read_register(current_neutral, current_neutral_data_size, current_neutral_scale)}",
                        "voltage_phase_a": f"{read_register(voltage_phase_a, voltage_phase_a_data_size, voltage_phase_a_scale)}",
                        "voltage_phase_b": f"{read_register(voltage_phase_b, voltage_phase_b_data_size, voltage_phase_b_scale)}",
                        "voltage_phase_c": f"{read_register(voltage_phase_c, voltage_phase_c_data_size, voltage_phase_c_scale)}",
                        "voltage_a_neutral": f"{read_register(voltage_a_neutral, voltage_a_neutral_data_size, voltage_a_neutral_scale)}",
                        "voltage_b_neutral": f"{read_register(voltage_b_neutral, voltage_b_neutral_data_size, voltage_b_neutral_scale)}",
                        "voltage_c_neutral": f"{read_register(voltage_c_neutral, voltage_c_neutral_data_size, voltage_c_neutral_scale)}",
                        "power_real": f"{read_register(power_real, power_real_data_size, current_phase_a_scale)}",
                        "power_reactive": f"{read_register(power_reactive, power_reactive_data_size, power_reactive_scale)}",
                        "power_factor": f"{read_register(power_factor, power_factor_data_size, power_factor_scale)}",
                        "frequency": f"{read_register(frequency, frequency_data_size, frequency_scale)}",
                        "voltage_battery": f"{read_register(voltage_battery, voltage_battery_data_size, voltage_battery_scale)}",
                        "energy_import": f"{energy_import_data}",
                        "energy_export": f"{energy_export_data}",
                        "energy_total": f"{energy_total_data}",
                        "device_id": os.getenv("RECLOSER_DEVICE_ID"),
                        "device_readable_name": os.getenv("RECLOSER_DEVICE_READABLE_NAME"),
                        "site_id": os.getenv("SITE_ID"),
                        "edge_id": os.getenv("EDGE_ID"),
                        "device_model": os.getenv("RECLOSER_DEVICE_MODEL")
                     }

    client.close()
    timestamp = int(datetime.now().timestamp()*1000)
    os.makedirs("/collect_data/recloser", exist_ok=True)
    with open(f"/collect_data/recloser/{timestamp}.json", 'w') as json_file:
        json.dump(collected_data, json_file, indent=4)


if __name__ == "__main__":
    # adding an initial sleep period to hopefully avoid network congestion at larger sites
    time.sleep(11)
    while True:
        try:
            logger.info("Recloser collect starting")
            collect_data_tcp(os.getenv("RECLOSER_IP"), int(os.getenv("RECLOSER_PORT")))
            logger.info("Recloser collect finished")
        except Exception as e:
            logger.error(e)
        time.sleep(30)
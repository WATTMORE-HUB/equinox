import asyncio
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

# for managing proprietary inverter libraries
inverter_type                     = os.getenv("INVERTER_TYPE")

# for register processing
base                              = int(os.getenv("INVERTER_REGISTER_BASE"))

# modbus identification
modbus_slave_ids                  = os.getenv("MODBUS_SLAVE_IDS")
inverter_ids                      = os.getenv("INVERTER_ID_LIST")

# for modbus connection init
inverter_function_code            = int(os.getenv("INVERTER_FUNCTION_CODE"))
inverter_baud_rate                = int(os.getenv("INVERTER_BAUD_RATE"))

# registers
ac_output_power_reg               = int(os.getenv("AC_OUTPUT_POWER"), base)
ac_output_voltage_l1l2_reg        = int(os.getenv("AC_OUTPUT_VOLTAGE_L1L2"), base)
ac_output_voltage_l2l3_reg        = int(os.getenv("AC_OUTPUT_VOLTAGE_L2L3"), base)
ac_output_voltage_l3l1_reg        = int(os.getenv("AC_OUTPUT_VOLTAGE_L3L1"), base)
active_faults_reg                 = int(os.getenv("ACTIVE_FAULTS"), base)
active_warnings_reg               = int(os.getenv("ACTIVE_WARNINGS"), base)
cumalutive_operation_reg          = int(os.getenv("CUMALUTIVE_OPERATION"), base)
dc_input_current_1_reg            = int(os.getenv("DC_INPUT_CURRENT_1"), base)
dc_input_current_2_reg            = int(os.getenv("DC_INPUT_CURRENT_2"), base)
dc_input_current_3_reg            = int(os.getenv("DC_INPUT_CURRENT_3"), base)
dc_input_voltage_1_reg            = int(os.getenv("DC_INPUT_VOLTAGE_1"), base)
dc_input_voltage_2_reg            = int(os.getenv("DC_INPUT_VOLTAGE_2"), base)
dc_input_voltage_3_reg            = int(os.getenv("DC_INPUT_VOLTAGE_3"), base)
energy_today_reg                  = int(os.getenv("ENERGY_TODAY"), base)
grid_connected_status_reg         = int(os.getenv("GRID_CONNECTED_STATUS"), base)
grid_frequency_reg                = int(os.getenv("GRID_FREQUENCY"), base)
inverter_efficiency_reg           = int(os.getenv("INVERTER_EFFICIENCY"), base)
inverter_status_code_reg          = int(os.getenv("INVERTER_STATUS_CODE"), base)
inverter_temperature_reg          = int(os.getenv("INVERTER_TEMPERATURE"), base)
l1_current_reg                    = int(os.getenv("L1_CURRENT"), base)
l1_n_voltage_reg                  = int(os.getenv("L1_N_VOLTAGE"), base)
l2_current_reg                    = int(os.getenv("L2_CURRENT"), base)
l2_n_voltage_reg                  = int(os.getenv("L2_N_VOLTAGE"), base)
l3_current_reg                    = int(os.getenv("L3_CURRENT"), base)
l3_n_voltage_reg                  = int(os.getenv("L3_N_VOLTAGE"), base)
mppt_current_reg                  = int(os.getenv("MPPT_CURRENT"), base)
mppt_voltage_reg                  = int(os.getenv("MPPT_VOLTAGE"), base)
operating_mode_reg                = int(os.getenv("OPERATING_MODE"), base)
power_factor_reg                  = int(os.getenv("POWER_FACTOR"), base)
power_limit_reg                   = int(os.getenv("POWER_LIMIT"), base)
reactive_power_reg                = int(os.getenv("REACTIVE_POWER"), base)
total_energy_reg                  = int(os.getenv("TOTAL_ENERGY"), base)

# power registers, likely calculated
l1_power_reg                      = int(os.getenv("L1_POWER_REG"), base)
l2_power_reg                      = int(os.getenv("L2_POWER_REG"), base)
l3_power_reg                      = int(os.getenv("L3_POWER_REG"), base)
dc_input_power_1_reg              = int(os.getenv("DC_INPUT_POWER_1_REG"), base)
dc_input_power_2_reg              = int(os.getenv("DC_INPUT_POWER_2_REG"), base)
dc_input_power_3_reg              = int(os.getenv("DC_INPUT_POWER_3_REG"), base)

# data scaling
ac_output_power_scale             = float(os.getenv("I_AC_OUTPUT_POWER_SCALE"))
ac_output_voltage_scale           = float(os.getenv("I_AC_OUTPUT_VOLTAGE_SCALE"))
input_current_scale               = float(os.getenv("I_INPUT_CURRENT_SCALE"))
input_voltage_scale               = float(os.getenv("I_INPUT_VOLTAGE_SCALE"))
energy_today_scale                = float(os.getenv("I_ENERGY_TODAY_SCALE"))
grid_frequency_scale              = float(os.getenv("I_GRID_FREQUENCY_SCALE"))
inverter_temperature_scale        = float(os.getenv("I_INVERTER_TEMPERATURE_SCALE"))
current_scale                     = float(os.getenv("I_CURRENT_SCALE"))
power_factor_scale                = float(os.getenv("I_POWER_FACTOR_SCALE"))
total_energy_scale                = float(os.getenv("I_TOTAL_ENERGY_SCALE"))
power_scale                       = float(os.getenv("I_POWER_SCALE"))
input_power_scale                 = float(os.getenv("I_INPUT_POWER_SCALE"))
inverter_efficiency_scale         = float(os.getenv("I_INVERTER_EFFICIENCY_SCALE"))
n_voltage_scale                   = float(os.getenv("I_N_VOLTAGE_SCALE"))
mppt_current_scale                = float(os.getenv("I_MPPT_CURRENT_SCALE"))
mppt_voltage_scale                = float(os.getenv("I_MPPT_VOLTAGE_SCALE"))
power_limit_scale                 = float(os.getenv("I_POWER_LIMIT_SCALE"))
reactive_power_scale              = float(os.getenv("I_REACTIVE_POWER_SCALE"))

# new variables
dc_input_current_scale            = float(os.getenv("I_DC_INPUT_CURRENT_SCALE"))

ip_address = os.getenv("ip_address")


def collect_data(modbus_slave_id, device_id_env):

    """Run async client."""
    # activate debugging

    instrument = minimalmodbus.Instrument(os.getenv("USB1"), modbus_slave_id)  # Port, slave ID
    instrument.serial.baudrate = inverter_baud_rate
    instrument.serial.bytesize = 8
    instrument.serial.parity   = minimalmodbus.serial.PARITY_NONE
    instrument.serial.stopbits = 1
    instrument.serial.timeout  = 1  # seconds
    instrument.mode = minimalmodbus.MODE_RTU
    
            
    if device_id_env == "4d548009-e5eb-4f09-b7df-3eb44d85a8c3":
        device_name = "Chint CPS-SCA-50KTL"
    else:
        device_name = "Chint CPS-SCA-60KTL"
    
    
    # def read_register(register, scale):
    #     try:
    #         data = instrument.read_register(register,
    #                                         functioncode=inverter_function_code)
    #         return data*scale
    #     except Exception as e:
    #         logger.info(e)
    #         return "NULL"
    
    def read_register(register, scale, max_retries=3):
        for attempt in range(max_retries):
            try:
                data = instrument.read_register(register,
                                                functioncode=inverter_function_code)
                time.sleep(0.05)
                return data*scale
            except minimalmodbus.NoResponseError:
                return "NULL"
            except Exception as e:
                if attempt < max_retries - 1:
                    logger.warning(f"Attempt {attempt + 1} failed for register {register}: {e}")
                    time.sleep(0.1)  # Wait before retry
                else:
                    logger.error(f"All {max_retries} attempts failed for register {register}: {e}")
                    return "NULL"
            
    def read_non_scaled_register(register, max_retries=3):
        for attempt in range(max_retries):
            try:
                data = instrument.read_register(register,
                                                functioncode=inverter_function_code)
                time.sleep(0.05)
                return data
            except minimalmodbus.NoResponseError:
                return "NULL"
            except Exception as e:
                if attempt < max_retries - 1:
                    logger.warning(f"Attempt {attempt + 1} failed for register {register}: {e}")
                    time.sleep(0.1)  # Wait before retry
                else:
                    logger.error(f"All {max_retries} attempts failed for register {register}: {e}")
                    return "NULL"
            

    def power_calc(ac_output_voltage_l1l2,ac_output_voltage_l2l3, ac_output_voltage_l3l1,
                   l1_current, l2_current, l3_current):
        # the power_calc below is how we calc single line power for Catalyst-Lynokaen
        # ac_o_vl1l2 = ac_output_voltage_l1l2*ac_output_voltage_scale
        # ac_o_vl2l3 = ac_output_voltage_l2l3*ac_output_voltage_scale
        # ac_o_vl3l1 = ac_output_voltage_l3l1*ac_output_voltage_scale
        # l1_c = l1_current*current_scale
        # l2_c = l2_current*current_scale
        # l3_c = l3_current*current_scale
        # power_calc = 1.732 * ((ac_o_vl1l2 + ac_o_vl2l3 + ac_o_vl3l1)/3) * ((l1_c + l2_c + l3_c)/3)
        # single_line_power = power_calc/3
        # return single_line_power
        # pass
        if ac_output_voltage_l1l2 == "NULL":
            ac_o_vl1l2 = 0
        else:
            ac_o_vl1l2 = ac_output_voltage_l1l2

        if ac_output_voltage_l2l3 == "NULL":
            ac_o_vl2l3 = 0
        else:
            ac_o_vl2l3 = ac_output_voltage_l2l3

        if ac_output_voltage_l3l1 == "NULL":
            ac_o_vl3l1 = 0
        else:
            ac_o_vl3l1 = ac_output_voltage_l3l1

        if l1_current == "NULL":
            l1_c = 0
        else:
            l1_c = l1_current

        if l2_current == "NULL":
            l2_c = 0
        else:
            l2_c = l2_current

        if l3_current == "NULL":
            l3_c = 0
        else:
            l3_c = l3_current
        try:
            power_calc = 1.732 * ((ac_o_vl1l2 + ac_o_vl2l3 + ac_o_vl3l1)/3) * ((l1_c + l2_c + l3_c)/3)
            single_line_power = power_calc/3
            return single_line_power*0.001
        except Exception as e:
            logger.error(e)
            return "NULL"
        
        
    try:
        #these have to be calculated for the power readings below (in case an inverter doesn't have power registers)
        ac_output_voltage_l1l2 = read_register(ac_output_voltage_l1l2_reg, ac_output_voltage_scale)
        ac_output_voltage_l2l3 = read_register(ac_output_voltage_l2l3_reg, ac_output_voltage_scale)
        ac_output_voltage_l3l1 = read_register(ac_output_voltage_l3l1_reg, ac_output_voltage_scale)

        l1_n_voltage           = read_register(l1_n_voltage_reg, n_voltage_scale)
        l2_n_voltage           = read_register(l2_n_voltage_reg, n_voltage_scale)
        l3_n_voltage           = read_register(l3_n_voltage_reg, n_voltage_scale)
        
        l1_current             = read_register(l1_current_reg, current_scale)
        l2_current             = read_register(l2_current_reg, current_scale)
        l3_current             = read_register(l3_current_reg, current_scale)
        dc_input_current_1     = read_register(dc_input_current_1_reg, input_current_scale)
        dc_input_current_2     = read_register(dc_input_current_2_reg, input_current_scale)
        dc_input_current_3     = read_register(dc_input_current_3_reg, input_current_scale)
        dc_input_voltage_1     = read_register(dc_input_voltage_1_reg, input_voltage_scale)
        dc_input_voltage_2     = read_register(dc_input_voltage_2_reg, input_voltage_scale)
        dc_input_voltage_3     = read_register(dc_input_voltage_3_reg, input_voltage_scale)
        power_factor           = 1
        
        # l123_power = power_calc(ac_output_voltage_l1l2,ac_output_voltage_l2l3,
        #                         ac_output_voltage_l3l1, l1_current, l2_current,
        #                         l3_current)
        
        
        
        poll_data = {
            "ac_output_power": [read_register(ac_output_power_reg, ac_output_power_scale), "DOUBLE"],
            "ac_output_voltage_l1l2": ["NULL", "DOUBLE"],
            "ac_output_voltage_l2l3": ["NULL", "DOUBLE"],
            "ac_output_voltage_l3l1": ["NULL", "DOUBLE"],
            "active_faults": [read_non_scaled_register(active_faults_reg), "VARCHAR"],
            "active_warnings": [read_non_scaled_register(active_warnings_reg), "VARCHAR"],
            "cumalutive_operation": [read_non_scaled_register(cumalutive_operation_reg), "DOUBLE"],
            "dc_input_current_1": [dc_input_current_1, "DOUBLE"],
            "dc_input_current_2": [dc_input_current_2, "DOUBLE"],
            "dc_input_current_3": [dc_input_current_3, "DOUBLE"],
            "dc_input_voltage_1": [dc_input_voltage_1, "DOUBLE"],
            "dc_input_voltage_2": [dc_input_voltage_2, "DOUBLE"],
            "dc_input_voltage_3": [dc_input_voltage_3, "DOUBLE"],
            "energy_today": [read_register(energy_today_reg, energy_today_scale), "DOUBLE"],
            "grid_frequency": [read_register(grid_frequency_reg, grid_frequency_scale), "DOUBLE"],
            "inverter_status_code": [read_non_scaled_register(inverter_status_code_reg), "VARCHAR"],
            "inverter_temperature": [read_register(inverter_temperature_reg, inverter_temperature_scale) * (9/5) + 32, "DOUBLE"],
            "l1_current": [l1_current, "DOUBLE"],
            "l2_current": [l2_current, "DOUBLE"],
            "l3_current": [l3_current, "DOUBLE"],
            "operating_mode": [read_non_scaled_register(operating_mode_reg), "VARCHAR"],
            "power_factor": [power_factor, "DOUBLE"],
            "total_energy": [read_register(total_energy_reg, total_energy_scale), "DOUBLE"],
            "l1_power": [l1_n_voltage*l1_current*.001 , "DOUBLE"],
            "l2_power": [l2_n_voltage*l2_current*.001 , "DOUBLE"],
            "l3_power": [l3_n_voltage*l3_current*.001, "DOUBLE"],
            "dc_input_power_1": [(dc_input_current_1*dc_input_voltage_1)*.01, "DOUBLE"],
            "dc_input_power_2": [(dc_input_current_2*dc_input_voltage_2)*.01, "DOUBLE"],
            "dc_input_power_3": [(dc_input_current_3*dc_input_voltage_3)*.01, "DOUBLE"],
            "device_id": [device_id_env, "DIMENSION"],
            "device_model": [device_name, "DIMENSION"],
            "device_readable_name": [device_name, "DIMENSION"],
            "edge_id": [os.getenv('EDGE_ID'), "DIMENSION"],
            "grid_connected_status": ["True", "BOOLEAN"],
            "inverter_efficiency": ["NULL", "DOUBLE"],
            "l1_n_voltage": [l1_n_voltage, "DOUBLE"],
            "l2_n_voltage": [l2_n_voltage, "DOUBLE"],
            "l3_n_voltage": [l3_n_voltage, "DOUBLE"],
            "mppt_current": ["NULL", "DOUBLE"],
            "mppt_voltage": ["NULL", "DOUBLE"],
            "power_limit": [read_register(power_limit_reg, power_limit_scale), "DOUBLE"],
            "reactive_power": [read_register(reactive_power_reg, reactive_power_scale), "DOUBLE"],
            "site_id": [os.getenv('SITE_ID'), "DIMENSION"]
                    }

        collected_data = poll_data
        timestamp = int(datetime.now().timestamp()*1000)
        os.makedirs("/collect_data/inverter", exist_ok=True)
        with open(f"/collect_data/inverter/{timestamp}.json", 'w') as json_file:
            json.dump(collected_data, json_file, indent=4)
    except Exception as e:
        print("Read failed:", e)


if __name__ == "__main__":
    # primary loop
    # time.sleep(15)
    inverters = modbus_slave_ids.split(",")
    device_ids = inverter_ids.split(",")
    print("Inverters")
    print(inverters)
    print("Device_IDs")
    print(device_ids)
    while True:
        for x in inverters:
            try:
                logger.info("Main loop begin")
                print(f"Device ID: {device_ids[inverters.index(x)]}")
                collect_data(int(x), device_ids[inverters.index(x)])
                logger.info("Loop finished")
            except Exception as e:
                logger.error(e)
        time.sleep(30)
    
    # for testing solo
    # for x in inverters:
    #     try:
    #         logger.info("Main loop begin")
    #         collect_data(int(x), device_ids[inverters.index(x)])
    #         logger.info("Loop finished")
    #     except Exception as e:
    #         logger.error(e)
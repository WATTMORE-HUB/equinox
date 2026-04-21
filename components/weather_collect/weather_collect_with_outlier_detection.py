

import minimalmodbus
import logging
import json
from sys import stdout
from datetime import datetime, timezone
import time
import os
import math
from collections import deque
import statistics

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


# ==================== OUTLIER DETECTION CONFIGURATION ====================
# Adjust these based on your sensor characteristics and environment

class OutlierConfig:
    """Configuration for outlier detection per sensor type"""
    
    # Temperature outlier detection
    # Expected range in Fahrenheit (adjust based on your location/season)
    TEMP_MIN_F = -50
    TEMP_MAX_F = 150
    
    # Maximum rate of change per minute (in Fahrenheit) - physical limit
    # Normal weather doesn't change more than ~5°F per minute
    MAX_TEMP_CHANGE_PER_MIN = 5.0
    
    # Z-score threshold for statistical outliers (2.5 = ~1.2% outliers expected)
    TEMP_ZSCORE_THRESHOLD = 2.5
    
    # Moving window size for statistical analysis (number of readings to keep)
    MOVING_WINDOW_SIZE = 20
    
    # Irradiance outlier detection
    # Expected range in W/m² (typical irradiance 0-1300)
    IRRADIANCE_MIN = 0
    IRRADIANCE_MAX = 1400
    
    # Maximum rate of change per minute in W/m²
    MAX_IRRADIANCE_CHANGE_PER_MIN = 200
    
    # Z-score threshold for irradiance
    IRRADIANCE_ZSCORE_THRESHOLD = 3.0


class SensorHistory:
    """Maintains a rolling history of sensor readings for outlier detection"""
    
    def __init__(self, sensor_name, max_history=OutlierConfig.MOVING_WINDOW_SIZE):
        self.sensor_name = sensor_name
        self.max_history = max_history
        self.readings = deque(maxlen=max_history)
        self.timestamps = deque(maxlen=max_history)
        self.last_valid_value = None
        self.consecutive_failures = 0
        
    def add_reading(self, value, timestamp=None):
        """Add a reading to history"""
        if timestamp is None:
            timestamp = time.time()
        self.readings.append(value)
        self.timestamps.append(timestamp)
        
    def get_recent_valid_values(self, exclude_current=True):
        """Get recent valid readings"""
        values = list(self.readings)
        if exclude_current and values:
            values = values[:-1]  # Exclude the most recent (being evaluated)
        return [v for v in values if v is not None and v != "NULL"]
    
    def get_time_delta_minutes(self):
        """Get time elapsed since last reading in minutes"""
        if len(self.timestamps) < 2:
            return 0
        return (self.timestamps[-1] - self.timestamps[-2]) / 60.0


# Create history trackers for each sensor
sensor_histories = {}
HISTORY_FILE_PATH = "/collect_data/weather_sensor_history.json"
HISTORY_MAX_POINTS = 100

def load_history_from_file():
    """Load persisted sensor history from file"""
    try:
        if os.path.exists(HISTORY_FILE_PATH):
            with open(HISTORY_FILE_PATH, 'r') as f:
                data = json.load(f)
                for sensor_name, sensor_data in data.items():
                    history = SensorHistory(sensor_name, max_history=OutlierConfig.MOVING_WINDOW_SIZE)
                    if sensor_data.get('readings'):
                        # Load readings and timestamps
                        for reading, timestamp in zip(sensor_data['readings'], sensor_data.get('timestamps', [])):
                            history.add_reading(reading, timestamp)
                    history.last_valid_value = sensor_data.get('last_valid_value')
                    history.consecutive_failures = sensor_data.get('consecutive_failures', 0)
                    sensor_histories[sensor_name] = history
                logger.info(f"Loaded sensor history from {HISTORY_FILE_PATH}")
    except Exception as e:
        logger.warning(f"Could not load history file: {e}. Starting with fresh history.")

def save_history_to_file():
    """Persist sensor history to file for next startup"""
    try:
        os.makedirs("/collect_data", exist_ok=True)
        data = {}
        for sensor_name, history in sensor_histories.items():
            data[sensor_name] = {
                'readings': list(history.readings)[-HISTORY_MAX_POINTS:],  # Keep last 100
                'timestamps': list(history.timestamps)[-HISTORY_MAX_POINTS:],
                'last_valid_value': history.last_valid_value,
                'consecutive_failures': history.consecutive_failures
            }
        with open(HISTORY_FILE_PATH, 'w') as f:
            json.dump(data, f)
    except Exception as e:
        logger.warning(f"Could not save history file: {e}")

def get_sensor_history(sensor_name):
    """Get or create sensor history tracker"""
    if sensor_name not in sensor_histories:
        sensor_histories[sensor_name] = SensorHistory(sensor_name)
    return sensor_histories[sensor_name]


def is_temperature_valid(raw_temp, sensor_name="temp", previous_valid_value=None):
    """
    Validate temperature reading using multiple criteria
    
    Returns tuple: (is_valid, validated_temp, rejection_reason)
    """
    
    if raw_temp == "NULL":
        return False, "NULL", "No data (NULL)"
    
    # Check hard bounds first
    if raw_temp < OutlierConfig.TEMP_MIN_F or raw_temp > OutlierConfig.TEMP_MAX_F:
        return False, "NULL", f"Out of physical bounds ({OutlierConfig.TEMP_MIN_F}°F to {OutlierConfig.TEMP_MAX_F}°F)"
    
    history = get_sensor_history(sensor_name)
    
    # Check rate of change if we have a previous valid reading
    if history.last_valid_value is not None:
        time_delta = history.get_time_delta_minutes()
        if time_delta > 0:
            change = abs(raw_temp - history.last_valid_value)
            max_allowed = OutlierConfig.MAX_TEMP_CHANGE_PER_MIN * time_delta
            
            if change > max_allowed:
                return False, "NULL", f"Rate of change too high ({change:.1f}°F change in {time_delta:.1f} min, max {max_allowed:.1f}°F allowed)"
    
    # Check statistical outliers if we have enough history
    recent_readings = history.get_recent_valid_values(exclude_current=False)
    if len(recent_readings) >= 5:  # Need minimum 5 readings for stats
        try:
            mean = statistics.mean(recent_readings)
            stdev = statistics.stdev(recent_readings)
            
            if stdev > 0:  # Avoid division by zero
                zscore = abs((raw_temp - mean) / stdev)
                if zscore > OutlierConfig.TEMP_ZSCORE_THRESHOLD:
                    return False, "NULL", f"Statistical outlier (z-score: {zscore:.2f}, mean: {mean:.1f}°F, stdev: {stdev:.1f}°F)"
        except Exception as e:
            logger.warning(f"Error calculating z-score for {sensor_name}: {e}")
    
    return True, raw_temp, None


def is_irradiance_valid(raw_irradiance, sensor_name="irradiance"):
    """
    Validate irradiance reading using multiple criteria
    
    Returns tuple: (is_valid, validated_irradiance, rejection_reason)
    """
    
    if raw_irradiance == "NULL":
        return False, "NULL", "No data (NULL)"
    
    # Check hard bounds
    if raw_irradiance < OutlierConfig.IRRADIANCE_MIN or raw_irradiance > OutlierConfig.IRRADIANCE_MAX:
        return False, "NULL", f"Out of bounds ({OutlierConfig.IRRADIANCE_MIN} to {OutlierConfig.IRRADIANCE_MAX} W/m²)"
    
    history = get_sensor_history(sensor_name)
    
    # Check rate of change
    if history.last_valid_value is not None:
        time_delta = history.get_time_delta_minutes()
        if time_delta > 0:
            change = abs(raw_irradiance - history.last_valid_value)
            max_allowed = OutlierConfig.MAX_IRRADIANCE_CHANGE_PER_MIN * time_delta
            
            if change > max_allowed:
                return False, "NULL", f"Rate of change too high ({change:.1f} W/m² change in {time_delta:.1f} min)"
    
    # Check statistical outliers
    recent_readings = history.get_recent_valid_values(exclude_current=False)
    if len(recent_readings) >= 5:
        try:
            mean = statistics.mean(recent_readings)
            stdev = statistics.stdev(recent_readings)
            
            if stdev > 0:
                zscore = abs((raw_irradiance - mean) / stdev)
                if zscore > OutlierConfig.IRRADIANCE_ZSCORE_THRESHOLD:
                    return False, "NULL", f"Statistical outlier (z-score: {zscore:.2f})"
        except Exception as e:
            logger.warning(f"Error calculating z-score for {sensor_name}: {e}")
    
    return True, raw_irradiance, None


def log_outlier_detection(sensor_name, raw_value, reason, valid_value):
    """Log when an outlier is detected"""
    history = get_sensor_history(sensor_name)
    history.consecutive_failures += 1
    
    logger.warning(
        f"OUTLIER DETECTED [{sensor_name}] Raw={raw_value}, "
        f"Reason: {reason}, Using: {valid_value}, "
        f"Consecutive failures: {history.consecutive_failures}"
    )
    
    # Alert if sensor is consistently bad
    if history.consecutive_failures >= 3:
        logger.error(f"SENSOR ALERT: {sensor_name} has {history.consecutive_failures} consecutive failed readings")


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
        # Read ambient air temperature
        raw_ambient_temp = temp_calc(read_register(ambient_air_temperature_reg, weather_function_code, ambient_air_temperature_data_size), -29, 78)
        
        # Validate ambient temperature
        is_valid_ambient, validated_ambient_temp, rejection_reason = is_temperature_valid(raw_ambient_temp, "ambient_air_temperature")
        if not is_valid_ambient:
            ambient_air_temp_history = get_sensor_history("ambient_air_temperature")
            log_outlier_detection("ambient_air_temperature", raw_ambient_temp, rejection_reason, "NULL")
            # Rejected values become NULL - don't propagate stale data
            validated_ambient_temp = "NULL"
        else:
            # Update history and last valid value
            ambient_air_temp_history = get_sensor_history("ambient_air_temperature")
            ambient_air_temp_history.add_reading(raw_ambient_temp)
            ambient_air_temp_history.last_valid_value = raw_ambient_temp
            ambient_air_temp_history.consecutive_failures = 0
        
        # Read back of PV temperature
        raw_pv_temp = temp_calc(read_register(back_of_temperature_pv_reg, weather_function_code, back_of_temperature_pv_data_size), -40, 125)
        
        # Validate PV temperature
        is_valid_pv, validated_pv_temp, rejection_reason = is_temperature_valid(raw_pv_temp, "back_of_temperature_pv")
        if not is_valid_pv:
            pv_temp_history = get_sensor_history("back_of_temperature_pv")
            log_outlier_detection("back_of_temperature_pv", raw_pv_temp, rejection_reason, "NULL")
            # Rejected values become NULL - don't propagate stale data
            validated_pv_temp = "NULL"
        else:
            pv_temp_history = get_sensor_history("back_of_temperature_pv")
            pv_temp_history.add_reading(raw_pv_temp)
            pv_temp_history.last_valid_value = raw_pv_temp
            pv_temp_history.consecutive_failures = 0
        
        # Read and validate irradiance
        raw_poa_irradiance = irradiance_calc(read_register(plane_of_array_irradiance_reg, weather_function_code, plane_of_array_irradiance_data_size), 13.60)
        
        is_valid_poa, validated_poa, rejection_reason = is_irradiance_valid(raw_poa_irradiance, "plane_of_array_irradiance")
        if not is_valid_poa:
            poa_history = get_sensor_history("plane_of_array_irradiance")
            log_outlier_detection("plane_of_array_irradiance", raw_poa_irradiance, rejection_reason, "NULL")
            # Rejected values become NULL - don't propagate stale data
            validated_poa = "NULL"
        else:
            poa_history = get_sensor_history("plane_of_array_irradiance")
            poa_history.add_reading(raw_poa_irradiance)
            poa_history.last_valid_value = raw_poa_irradiance
            poa_history.consecutive_failures = 0
        
        poll_data = {
            "device_readable_name": [os.getenv("WEATHER_READABLE_NAME"), "DIMENSION"],
            "device_id": [device_id_env, "DIMENSION"],
            "device_model": [os.getenv("WEATHER_DEVICE_MODEL"), "DIMENSION"],
            "site_id": [os.getenv('SITE_ID'), "DIMENSION"],
            "edge_id": [os.getenv('EDGE_ID'), "DIMENSION"],
            "ambient_air_temperature": [validated_ambient_temp, "DOUBLE"],
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
            "plane_of_array_irradiance": [validated_poa, "DOUBLE"],
            "back_of_temperature_pv": [validated_pv_temp, "DOUBLE"]
        }
        
        collected_data = poll_data
        timestamp = int(datetime.now().timestamp()*1000)
        os.makedirs("/collect_data/weather", exist_ok=True)
        with open(f"/collect_data/weather/{timestamp}.json", 'w') as json_file:
            json.dump(collected_data, json_file, indent=4)
    except Exception as e:
        print("Read failed:", e)


if __name__ == "__main__":
    # Load persisted history on startup
    load_history_from_file()
    
    # primary loop
    time.sleep(10)
    weather_stations = weather_modbus_slave_ids.split(",")
    device_ids = weather_ids.split(", ")
    print("Inverters")
    print(weather_stations)
    
    loop_count = 0
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
        
        # Save history to file every 10 iterations (every ~5 minutes with 30s interval)
        loop_count += 1
        if loop_count >= 10:
            save_history_to_file()
            loop_count = 0
        
        time.sleep(30)

import minimalmodbus
import pymodbus.client as ModbusClient
from pymodbus import (
    FramerType,
    ModbusException,
    pymodbus_apply_logging_config,
)
import time
import logging
from datetime import datetime, timezone
import os
import json


from awscrt import io, mqtt, auth, http
# from aswiotpythonsdk import mqtt_connection_builder
from awsiot import mqtt_connection_builder
from sys import stdout

logger = logging.getLogger(__name__)  # use module name
logging.basicConfig(filename='/enform_logs.log', format='%(asctime)s %(message)s', datefmt='%m/%d/%Y %I:%M:%S %p', level=logging.INFO)

ENDPOINT = os.getenv("AWSENDPOINT")
CLIENT_ID = os.getenv("THINGNAME")
CERT_NAME = os.getenv("CERT_NAME")
CERT = os.getenv("CERT")
KEY_NAME = os.getenv("KEY_NAME")
KEY = os.getenv("KEY")
CA_1_NAME = os.getenv("CA_1_NAME")
CA_1 = os.getenv("CA_1")
PATH_TO_AMAZON_ROOT_CA_1 = "./root.pem"
# MESSAGE = "Hello World"
TOPIC = "operate/heartbeat2"

# for register processing
# meter_base                        = int(os.getenv("METER_REGISTER_BASE"))
# inverter_base                     = int(os.getenv("INVERTER_REGISTER_BASE"))
# 
# # meter modbus identification
# meter_modbus_slave_ids            = os.getenv("METER_MODBUS_SLAVE_IDS")
# meter_ids                         = os.getenv("METER_IDS")
# 
# # inverter modbus identification
# modbus_slave_ids                  = os.getenv("MODBUS_SLAVE_IDS")
# inverter_ids                      = os.getenv("INVERTER_ID_LIST")
# 
# # for modbus connection init
# inverter_function_code            = int(os.getenv("INVERTER_FUNCTION_CODE"))
# inverter_baud_rate                = int(os.getenv("INVERTER_BAUD_RATE"))
# 
# # grid frequency registers for testing as guaranteed registers
# # GF for meters
# meter_grid_frequency_reg          = int(os.getenv("FREQ"), meter_base)
# meter_grid_frequency_data_size    = int(os.getenv("FREQ_DATA_SIZE"))
# 
# # GF for inverters
# grid_frequency_reg                = int(os.getenv("GRID_FREQUENCY"), inverter_base)
# grid_frequency_data_size          = int(os.getenv("GRID_FREQUENCY_DATA_SIZE"))


def make_certs():
    try:
        with open(f"/collect_data/{CERT_NAME}", "x") as f:
            f.write(CERT)
        print("Cert File created successfully.")
    except FileExistsError:
        print("Cert File already exists.")

    try:
        with open(f"/collect_data/{KEY_NAME}", "x") as f:
            f.write(KEY)
        print("Key File created successfully.")
    except FileExistsError:
        print("Key File already exists.")

    try:
        with open(f"/collect_data/{CA_1_NAME}", "x") as f:
            f.write(CA_1)
        print("CA_1 File created successfully.")
    except FileExistsError:
        print("CA_1 File already exists.")


def edge_heartbeat_msg():
    print(2)
    event_loop_group = io.EventLoopGroup(1)
    host_resolver = io.DefaultHostResolver(event_loop_group)
    client_bootstrap = io.ClientBootstrap(event_loop_group, host_resolver)
    print(3)
    mqtt_connection = mqtt_connection_builder.mtls_from_path(
        endpoint=ENDPOINT,
        cert_filepath=f"/collect_data/{CERT_NAME}",
        pri_key_filepath=f"/collect_data/{KEY_NAME}",
        client_bootstrap=client_bootstrap,
        ca_filepath=f"/collect_data/{CA_1_NAME}",
        client_id=CLIENT_ID,
        clean_session=False,
        keep_alive_secs=6
        )
    
    print("Connecting to {} with client ID '{}'...".format(
            ENDPOINT, CLIENT_ID))
    
    # Make the connect() call
    connect_future = mqtt_connection.connect()
    # Future.result() waits until a result is available
    connect_future.result()
    print("Connected!")
    
    try:

        message = {
                    "siteId": os.getenv("SITE"),
                    "deviceId": os.getenv("EDGE_ID"),
                    "edgeId": os.getenv("BALENA_DEVICE_UUID"),
                    "alertOccurredAt": int(datetime.now().timestamp()*1000)
                  }

        mqtt_connection.publish(topic=TOPIC,
                                payload=json.dumps(message),
                                qos=mqtt.QoS.AT_LEAST_ONCE)
        logger.info("Published: '" + json.dumps(message) + "' to the topic: " + "'operate/heartbeat2'")
        disconnect_future = mqtt_connection.disconnect()
        disconnect_future.result()
    except Exception as e:
        logger.error(e)


# def meter_heartbeat_msg():
    # try:
    #     instrument = minimalmodbus.Instrument(os.getenv("USB"), 1)  # Port, slave ID
    #     instrument.serial.baudrate = 9600
    #     instrument.serial.bytesize = 8
    #     instrument.serial.parity   = minimalmodbus.serial.PARITY_NONE
    #     instrument.serial.stopbits = 1
    #     instrument.serial.timeout  = 1  # seconds
    #     instrument.mode = minimalmodbus.MODE_RTU
    # 
    #     # this is the frequency read that acts as a heartbeat
    #     # assuming this will read successfully and continue on to deliver message
    #     # if it doesn't read, no heartbeat is sent
    #     # if meter_grid_frequency_size == 32:
    #     #     frequency = instrument.read_float(meter_grid_frequency, functioncode=3, number_of_registers=2)
    #     # if meter_grid_frequency_size == 16:
    #     #     frequency = instrument.read_register(meter_grid_frequency, functioncode=3)
    #     frequency = instrument.read_float(int(os.getenv("FREQ"), 16), functioncode=3, number_of_registers=2)
    #     print(frequency)
    #     event_loop_group = io.EventLoopGroup(1)
    #     host_resolver = io.DefaultHostResolver(event_loop_group)
    #     client_bootstrap = io.ClientBootstrap(event_loop_group, host_resolver)
    #     mqtt_connection = mqtt_connection_builder.mtls_from_path(
    #         endpoint=ENDPOINT,
    #         cert_filepath=f"/collect_data/{CERT_NAME}",
    #         pri_key_filepath=f"/collect_data/{KEY_NAME}",
    #         client_bootstrap=client_bootstrap,
    #         ca_filepath=f"/collect_data/{CA_1_NAME}",
    #         client_id=CLIENT_ID,
    #         clean_session=False,
    #         keep_alive_secs=6
    #         )
    #     print("Connecting to {} with client ID '{}'...".format(
    #             ENDPOINT, CLIENT_ID))
    #     # Make the connect() call
    #     connect_future = mqtt_connection.connect()
    #     # Future.result() waits until a result is available
    #     connect_future.result()
    #     print("Connected!")
    #     try:
    #         message = {
    #                     "siteId": os.getenv("SITE"),
    #                     "deviceId": os.getenv("METER_DEVICE_ID"),
    #                     "edgeId": os.getenv("BALENA_DEVICE_UUID"),
    #                     "alertOccurredAt": int(datetime.now().timestamp()*1000),
    #                     "timezone": "US/Mountain",
    #                     "deviceType": "meter"
    #                   }
    #         mqtt_connection.publish(topic=TOPIC,
    #                                 payload=json.dumps(message),
    #                                 qos=mqtt.QoS.AT_LEAST_ONCE)
    #         logger.info("Published: '" + json.dumps(message) + "' to the topic: " + "'operate/heartbeat'")
    #         disconnect_future = mqtt_connection.disconnect()
    #         disconnect_future.result()
    #     except Exception as e:
    #         logger.error(e)
    # except Exception as e:
    #     logger.error(e)


# def inverter_heartbeat_msg():
    # try:
    #     client: ModbusClient.ModbusBaseSyncClient
    #     client = ModbusClient.ModbusTcpClient(
    #         host="192.168.13.51",
    #         port="502",
    #         framer=FramerType.SOCKET,
    #         # timeout=10,
    #         # retries=3,
    #         # source_address=("localhost", 0),
    #     )
    #     client.connect()
    #     # hardcoded meter freq register for Zehr installation
    #     register_data = client.read_holding_registers(30039, count=2)
    #     inverter_heartbeat_data = client.convert_from_registers(register_data.registers, data_type=client.DATATYPE.FLOAT32)
    #     print(inverter_heartbeat_data)
    #     event_loop_group = io.EventLoopGroup(1)
    #     host_resolver = io.DefaultHostResolver(event_loop_group)
    #     client_bootstrap = io.ClientBootstrap(event_loop_group, host_resolver)
    #     mqtt_connection = mqtt_connection_builder.mtls_from_path(
    #         endpoint=ENDPOINT,
    #         cert_filepath=f"/collect_data/{CERT_NAME}",
    #         pri_key_filepath=f"/collect_data/{KEY_NAME}",
    #         client_bootstrap=client_bootstrap,
    #         ca_filepath=f"/collect_data/{CA_1_NAME}",
    #         client_id=CLIENT_ID,
    #         clean_session=False,
    #         keep_alive_secs=6
    #         )
    #     print("Connecting to {} with client ID '{}'...".format(
    #             ENDPOINT, CLIENT_ID))
    #     # Make the connect() call
    #     connect_future = mqtt_connection.connect()
    #     # Future.result() waits until a result is available
    #     connect_future.result()
    #     print("Connected!")
    #     try:
    #         message = {
    #                     "siteId": os.getenv("SITE"),
    #                     "deviceId": os.getenv("INVERTER_ID_LIST"),
    #                     "edgeId": os.getenv("BALENA_DEVICE_UUID"),
    #                     "alertOccurredAt": int(datetime.now().timestamp()*1000)
    #                   }
    #         mqtt_connection.publish(topic=TOPIC,
    #                                 payload=json.dumps(message),
    #                                 qos=mqtt.QoS.AT_LEAST_ONCE)
    #         logger.info("Published: '" + json.dumps(message) + "' to the topic: " + "'operate/heartbeat'")
    #         disconnect_future = mqtt_connection.disconnect()
    #         disconnect_future.result()
    #     except Exception as e:
    #         logger.error(e)
    # except Exception as e:
    #     logger.error(e)

# 
# def windspeed_heartbeat_msg():
        # try:
        #     client: ModbusClient.ModbusBaseSyncClient
        #     client = ModbusClient.ModbusTcpClient(
        #         host="192.168.13.100",
        #         port="502",
        #         framer=FramerType.SOCKET,
        #         # timeout=10,
        #         # retries=3,
        #         # source_address=("localhost", 0),
        #     )
        #     client.connect()
        #     # hardcoded meter freq register for Zehr installation
        #     windspeed_reg = client.read_holding_registers(0, count=1, slave=1)
        #     windspeed_data = client.convert_from_registers(windspeed_reg.registers,
        #                                                    data_type=client.DATATYPE.INT16)
        #     print(windspeed_data)
        #     event_loop_group = io.EventLoopGroup(1)
        #     host_resolver = io.DefaultHostResolver(event_loop_group)
        #     client_bootstrap = io.ClientBootstrap(event_loop_group, host_resolver)
        #     mqtt_connection = mqtt_connection_builder.mtls_from_path(
        #         endpoint=ENDPOINT,
        #         cert_filepath=f"/collect_data/{CERT_NAME}",
        #         pri_key_filepath=f"/collect_data/{KEY_NAME}",
        #         client_bootstrap=client_bootstrap,
        #         ca_filepath=f"/collect_data/{CA_1_NAME}",
        #         client_id=CLIENT_ID,
        #         clean_session=False,
        #         keep_alive_secs=6
        #         )
        #     print("Connecting to {} with client ID '{}'...".format(
        #             ENDPOINT, CLIENT_ID))
        #     # Make the connect() call
        #     connect_future = mqtt_connection.connect()
        #     # Future.result() waits until a result is available
        #     connect_future.result()
        #     print("Connected!")
        #     try:
        #         message = {
        #                     "siteId": os.getenv("SITE"),
        #                     "deviceId": os.getenv("WEATHER_DEVICE_ID_2"),
        #                     "edgeId": os.getenv("BALENA_DEVICE_UUID"),
        #                     "alertOccurredAt": int(datetime.now().timestamp()*1000)
        #                   }
        #         mqtt_connection.publish(topic=TOPIC,
        #                                 payload=json.dumps(message),
        #                                 qos=mqtt.QoS.AT_LEAST_ONCE)
        #         logger.info("Published: '" + json.dumps(message) + "' to the topic: " + "'operate/heartbeat'")
        #         disconnect_future = mqtt_connection.disconnect()
        #         disconnect_future.result()
        #     except Exception as e:
        #         logger.error(e)
        # except Exception as e:
        #     logger.error(e)


if __name__ == "__main__":
    make_certs()
    while True:
        time.sleep(17)
        try:
            print(1)
            edge_heartbeat_msg()
            # meter_heartbeat_msg()
            # inverter_heartbeat_msg()
            # weather_heartbeat_msg()
            # windspeed_heartbeat_msg()
            time.sleep(30)
        except Exception as e:
            logger.error(e)

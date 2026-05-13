import time
import logging
import os
import json
import psycopg2
from psycopg2.extras import Json
from awscrt import io, mqtt, auth, http
# from aswiotpythonsdk import mqtt_connection_builder
from awsiot import mqtt_connection_builder
from sys import stdout

logger = logging.getLogger('collect')

logger.setLevel(logging.DEBUG)
logFormatter = logging.Formatter("%(name)-12s %(asctime)s %(levelname)-8s %(filename)s:%(funcName)s %(message)s")
consoleHandler = logging.StreamHandler(stdout)
consoleHandler.setFormatter(logFormatter)
logger.addHandler(consoleHandler)

ENDPOINT = os.getenv("AWSENDPOINT")
CLIENT_ID = os.getenv("THINGNAME")
CERT_NAME = os.getenv("CERT_NAME")
CERT = os.getenv("CERT")
KEY_NAME = os.getenv("KEY_NAME")
KEY = os.getenv("KEY")
CA_1_NAME = os.getenv("CA_1_NAME")
CA_1 = os.getenv("CA_1")
PATH_TO_AMAZON_ROOT_CA_1 = "./root.pem"

# DB params
db_params = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'database': os.getenv('DB_NAME', 'your_database'),
    'user': os.getenv('DB_USER', 'your_username'),
    'password': os.getenv('DB_PASSWORD', 'your_password'),
    'port': os.getenv('DB_PORT', '5432')
}


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


def combine_and_delete(directory):

    # determine AWS IoT Topic
    if directory == "/collect_data/meter":
        # TOPIC = "operate/meter"
        TOPIC = "operate/lab_data"
    elif directory == "/collect_data/inverter":
        # TOPIC = "operate/inverter"
        TOPIC = "operate/lab_data"
    elif directory == "/collect_data/weather":
        # TOPIC = "operate/weather"
        TOPIC = "operate/lab_data"

    print("Set directory")

    # build AWS IoT MQTT connection
    # should this get moved outside the function?
    event_loop_group = io.EventLoopGroup(1)
    host_resolver = io.DefaultHostResolver(event_loop_group)
    client_bootstrap = io.ClientBootstrap(event_loop_group, host_resolver)
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
    # connect_future = mqtt_connection.connect()
    # print("MQTT connected")
    # # Future.result() waits until a result is available
    # connect_future.result()

    # build the DB connection
    conn = psycopg2.connect(**db_params)
    cur = conn.cursor()
    
    create_table_query = """
    CREATE TABLE IF NOT EXISTS offline_data (
        id SERIAL PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """
    cur.execute(create_table_query)
    
    print("Postgres connected")
    '''
    This is the primary combine and upload loop.
    Order of Operations:
        1. Get filenames
        2. Add file contents and filenames to array
        3. Delete files once their content has been recorded
        4. Upload combined_payload to AWS IoT Endpoint
            a. If unsuccessful, record combined_payload to Postgres
            b. If successful, check Postgres to see if there are any entries to upload
                i. If there are, upload them and truncate the table
    '''
    try:
        files_to_combine = []
        combined_payload = []
        for filename in os.listdir(directory):
            if filename.endswith(".json"):
                files_to_combine.append(filename)
        print(files_to_combine)
        for file in files_to_combine:
            # malformed data check/remove
            try:
                with open(f"{directory}/{file}", 'r') as small_file:
                    payload = {"time": f"{file[:-5]}", "data": json.load(small_file)}
                    combined_payload.append(payload)
            except Exception as e:
                logger.error(e)
            os.remove(f"{directory}/{file}")
        # print(combined_payload)

        try:
            # add mqtt connection code here, so the file processes and THEN checks for connection
            connect_future = mqtt_connection.connect()
            print("MQTT connected")
            # Future.result() waits until a result is available
            connect_future.result()

            print(1)
            message = {"upload from edge": combined_payload}
            print(message)
            print(TOPIC)
            mqtt_connection.publish(topic=TOPIC,
                                    payload=json.dumps(message),
                                    qos=mqtt.QoS.AT_LEAST_ONCE)
            logger.info("Published: '" + json.dumps(message) + "' to the topic: " + "'operate/meter'")
            # disconnect_future = mqtt_connection.disconnect()
            # disconnect_future.result()
            print(2)
        # should individual exceptions be identified here or just assume that
        # any failed connection for any reason requires postgres recording?
        
        # second question: should we truncate the table every time
        
            try:
                print(3)
                cur.execute('SELECT * FROM offline_data;')
                rows = cur.fetchall()
                # conn.commit()
                print(4)
                print("Rows")
                print(rows)
                for row in rows:
                    message = {"upload from edge": row[1]}
                    mqtt_connection.publish(topic="operate/lab_data_postgres",
                                            payload=json.dumps(message),
                                            qos=mqtt.QoS.AT_LEAST_ONCE)
                print(5)
                # delete data after uploading
                cur.execute('TRUNCATE TABLE offline_data;')
                print(6)
            except Exception as e:
                logger.info("Table read failed or table is empty")
                logger.error(e)
        except Exception as e:
            logger.error(e)
            logger.info("Beginning offline postgres write")

            # Insert JSON data
            try:
                cur.execute('INSERT INTO offline_data (data) VALUES (%s);',
                            (Json(combined_payload),))
            except Exception as e:
                logger.info(e)

    except Exception as e:
        logger.error(e)
    # close the MQTT connection
    try:
        disconnect_future = mqtt_connection.disconnect()
        disconnect_future.result()
    except Exception as e:
        logger.info(e)
    # Close the DB connection
    conn.commit()
    cur.close()
    conn.close()


if __name__ == "__main__":
    time.sleep(60)
    make_certs()
    # combine_and_delete("/collect_data/meter")
    while True:
        try:
            combine_and_delete("/collect_data/meter")
            combine_and_delete("/collect_data/inverter")
            combine_and_delete("/collect_data/weather")
            time.sleep(300)
        except Exception as e:
            logger.error(e)

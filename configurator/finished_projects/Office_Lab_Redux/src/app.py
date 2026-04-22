import cv2
from flask import Flask, Response, render_template, request, redirect, url_for, jsonify
from flask_cors import CORS
import threading
import logging
import json
import time
import os
from onvif import ONVIFCamera
from onvif.exceptions import ONVIFError
from awscrt import io, mqtt, auth, http
# from aswiotpythonsdk import mqtt_connection_builder
from awsiot import mqtt_connection_builder

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




# Disable FFmpeg threading to avoid assertion errors
os.environ['OPENCV_FFMPEG_CAPTURE_OPTIONS'] = 'threads;1'

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes
logging.basicConfig(level=logging.INFO)

# RTSP stream URL
RTSP_URL = 'rtsp://stream:stream42@192.168.1.248:554/h264Preview_01_sub'

# Global variables for video capture
camera = None
lock = threading.Lock()
latest_frame = None
frame_lock = threading.Lock()

ONVIFcamera = ONVIFCamera("192.168.1.248", 8000, "stream", "stream42")
ptz_service = ONVIFcamera.create_ptz_service()
media_service = ONVIFcamera.create_media_service()
profiles = media_service.GetProfiles()
profile = profiles[0]

def get_camera():
    """Initialize and return camera object"""
    global camera
    if camera is None or not camera.isOpened():
        logging.info(f"Connecting to RTSP stream: {RTSP_URL}")
        # Set connection options to avoid long hangs
        os.environ['OPENCV_FFMPEG_CAPTURE_OPTIONS'] = 'rtsp_transport;tcp|timeout;5000000|threads;1'
        camera = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)
        camera.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Reduce latency
        
        if not camera.isOpened():
            logging.error("Failed to open RTSP stream")
            return None
        logging.info("Successfully connected to RTSP stream")
    return camera

def frame_reader():
    """Background thread that continuously reads frames from RTSP stream"""
    global latest_frame, camera
    
    while True:
        with lock:
            cam = get_camera()
            if cam is None:
                time.sleep(1)
                continue
            
            success, frame = cam.read()
            if not success:
                logging.warning("Failed to read frame, reconnecting...")
                if camera is not None:
                    camera.release()
                    camera = None
                time.sleep(1)
                continue
        
        # Update latest frame
        with frame_lock:
            latest_frame = frame
        
        time.sleep(0.01)  # Small delay to prevent CPU spinning

def generate_frames():
    """Generate video frames from the latest captured frame"""
    while True:
        with frame_lock:
            if latest_frame is None:
                time.sleep(0.1)
                continue
            frame = latest_frame.copy()
        
        # Encode frame as JPEG
        ret, buffer = cv2.imencode('.jpg', frame)
        if not ret:
            continue
            
        frame_bytes = buffer.tobytes()
        
        # Yield frame in multipart format
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
        
        time.sleep(0.03)  # ~30 fps
        
def continuous_move(pan_speed=0, tilt_speed=0, zoom_speed=0, duration=1):
        """Continuous PTZ movement"""
        try:
            # Create velocity using dictionary
            velocity = {
                'PanTilt': {'x': pan_speed, 'y': tilt_speed},
                'Zoom': {'x': zoom_speed}
            }
            
            # Start continuous movement
            ptz_service.ContinuousMove({
                'ProfileToken': profile.token,
                'Velocity': velocity
            })
            
            print(f"Moving - Pan: {pan_speed:+.2f}, Tilt: {tilt_speed:+.2f}, Zoom: {zoom_speed:+.2f} for {duration}s")
            time.sleep(duration)
            
            # Stop movement
            ptz_service.Stop({
                'ProfileToken': profile.token,
                'PanTilt': True,
                'Zoom': True
            })
            
        except Exception as e:
            print(f"Error in continuous move: {e}")


def on_message_received(topic, payload, **kwargs):
    message_decode = payload.decode('utf-8')
    print(message_decode)
    print(type(message_decode))
    if message_decode == "L":
        continuous_move(-1, 0, 0, 0.5)
    elif message_decode == "R":
        continuous_move(1, 0, 0, 0.5)
    elif message_decode == "U":
        continuous_move(0, 1, 0, 0.5)
    elif message_decode == "D":
        continuous_move(0, -1, 0, 0.5)
    elif message_decode == "I":
        continuous_move(0, 0, 1, 0.5)
    elif message_decode == "I":
        continuous_move(0, 0, -1, 0.5)
    # try:
    #     json_message = json.loads(message_decode)
    #     print(json_message)
    # except Exception as e:
    #     logger.error(e)


@app.route('/')
def index():
    """Render the main page"""
    return render_template('index.html')


@app.route('/video_feed')
def video_feed():
    """Video streaming route"""
    response = Response(generate_frames(),
                        mimetype='multipart/x-mixed-replace; boundary=frame')
    response.headers['Access-Control-Allow-Origin'] = '*'
    return response


@app.route('/embed')
def embed():
    """Embeddable video player page"""
    return render_template('embed.html')


@app.route('/embed-code')
def embed_code():
    """Display embed code instructions"""
    # Get the host from request or use a default
    host = request.host
    return render_template('embed_code.html', host=host)


@app.route("/left", methods=["POST"])
def pan_left():
    continuous_move(-1, 0, 0, 0.5)
    return jsonify({"success": True, "action": "pan_left"})


@app.route("/right", methods=["POST"])
def pan_right():
    continuous_move(1, 0, 0, 0.5)
    return jsonify({"success": True, "action": "pan_right"})


@app.route("/up", methods=["POST"])
def tilt_up():
    continuous_move(0, 1, 0, 0.5)
    return jsonify({"success": True, "action": "tilt_up"})


@app.route("/down", methods=["POST"])
def tilt_down():
    continuous_move(0, -1, 0, 0.5)
    return jsonify({"success": True, "action": "tilt_down"})


@app.route("/in", methods=["POST"])
def zoom_in():
    continuous_move(0, 0, 1, 0.5)
    return jsonify({"success": True, "action": "zoom_in"})


@app.route("/out", methods=["POST"])
def zoom_out():
    continuous_move(0, 0, -1, 0.5)
    return jsonify({"success": True, "action": "zoom_out"})


if __name__ == '__main__':
    connect_future = mqtt_connection.connect()
    connect_future.result()
    subscribe_future, packet_id = mqtt_connection.subscribe(
        topic="operate/ptz",
        qos=mqtt.QoS.AT_MOST_ONCE,
        callback=on_message_received
    )

    # Start background frame reader thread
    reader_thread = threading.Thread(target=frame_reader, daemon=True)
    reader_thread.start()
    logging.info("Started background frame reader thread")
    app.run(host='0.0.0.0', port=80, threaded=True)

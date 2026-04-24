import json
import os
import time
import logging
import subprocess
from datetime import datetime, timezone, timedelta
from pathlib import Path
from awscrt import io, mqtt, auth, http
from awsiot import mqtt_connection_builder

logger = logging.getLogger(__name__)
logging.basicConfig(
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    level=logging.INFO
)

# Configuration
MONITORING_CACHE_PATH = "/collect_data/monitoring_cache.json"
MONITORING_CONFIG_PATH = "/collect_data/monitoring_config.json"
POLLING_INTERVAL = int(os.getenv("MONITORING_INTERVAL", "300"))  # 5 minutes default
LOG_RETENTION_DAYS = 7

# AWS IoT Core configuration (mirrors combine/heartbeat pattern)
AWSENDPOINT = os.getenv("AWSENDPOINT")
THINGNAME = os.getenv("THINGNAME")
CERT_NAME = os.getenv("CERT_NAME")
CERT = os.getenv("CERT")
KEY_NAME = os.getenv("KEY_NAME")
KEY = os.getenv("KEY")
CA_1_NAME = os.getenv("CA_1_NAME")
CA_1 = os.getenv("CA_1")
IOT_PUBLISH_ENABLED = os.getenv("IOT_PUBLISH_ENABLED", "false").lower() == "true"
IOT_TOPIC = os.getenv("IOT_TOPIC", "operate/device_reports")

# Ensure collect_data directory exists
Path("/collect_data").mkdir(parents=True, exist_ok=True)


def make_certs():
    """Create AWS IoT certificate files (same pattern as combine/heartbeat)"""
    if not AWSENDPOINT or not CERT or not KEY or not CA_1:
        logger.debug("AWS IoT credentials not configured, skipping cert creation")
        return False
    
    try:
        with open(f"/collect_data/{CERT_NAME}", "x") as f:
            f.write(CERT)
        logger.info("Cert file created")
    except FileExistsError:
        logger.debug("Cert file already exists")
    
    try:
        with open(f"/collect_data/{KEY_NAME}", "x") as f:
            f.write(KEY)
        logger.info("Key file created")
    except FileExistsError:
        logger.debug("Key file already exists")
    
    try:
        with open(f"/collect_data/{CA_1_NAME}", "x") as f:
            f.write(CA_1)
        logger.info("CA_1 file created")
    except FileExistsError:
        logger.debug("CA_1 file already exists")
    
    return True


class MonitoringService:
    def __init__(self):
        self.cache = self._load_cache()
        self.config = self._load_config()
        self.polling_interval = POLLING_INTERVAL
        self.mqtt_connection = None
        self._initialize_iot_connection()
    
    def _initialize_iot_connection(self):
        """Initialize AWS IoT MQTT connection using the same structure as combine/heartbeat"""
        if not IOT_PUBLISH_ENABLED:
            logger.debug("IoT Core publishing disabled")
            return
        
        if not AWSENDPOINT or not THINGNAME or not CERT_NAME or not KEY_NAME or not CA_1_NAME:
            logger.warning("IoT Core publishing enabled but AWS IoT env vars are incomplete")
            return
        
        try:
            make_certs()
            event_loop_group = io.EventLoopGroup(1)
            host_resolver = io.DefaultHostResolver(event_loop_group)
            client_bootstrap = io.ClientBootstrap(event_loop_group, host_resolver)
            self.mqtt_connection = mqtt_connection_builder.mtls_from_path(
                endpoint=AWSENDPOINT,
                cert_filepath=f"/collect_data/{CERT_NAME}",
                pri_key_filepath=f"/collect_data/{KEY_NAME}",
                client_bootstrap=client_bootstrap,
                ca_filepath=f"/collect_data/{CA_1_NAME}",
                client_id=THINGNAME,
                clean_session=False,
                keep_alive_secs=6
            )
            logger.info("AWS IoT MQTT connection initialized")
        except Exception as e:
            logger.error(f"Failed to initialize AWS IoT MQTT connection: {e}")
            self.mqtt_connection = None
    
    def _build_iot_message(self, summary, severity):
        """Build AWS IoT message payload for monitoring reports"""
        return {
            "siteId": os.getenv("SITE"),
            "deviceId": os.getenv("EDGE_ID"),
            "edgeId": os.getenv("BALENA_DEVICE_UUID"),
            "alertOccurredAt": int(datetime.now().timestamp() * 1000),
            "severity": severity,
            "summary": {
                "containerCount": summary["container_count"],
                "errorCount": len(summary["errors_recent"]),
                "warningCount": len(summary["warnings_recent"]),
                "containers": summary["containers"],
                "errorsRecent": summary["errors_recent"],
                "warningsRecent": summary["warnings_recent"]
            }
        }
    
    def _publish_to_iot(self, summary, severity):
        """Publish monitoring report to AWS IoT Core using the same pattern as combine/heartbeat"""
        if not IOT_PUBLISH_ENABLED or not self.mqtt_connection:
            return False
        
        try:
            # 15s timeout for connection
            connect_future = self.mqtt_connection.connect()
            connect_future.result(timeout=15)
            
            message = self._build_iot_message(summary, severity)
            topic = f"{IOT_TOPIC}/{os.getenv('BALENA_DEVICE_UUID', THINGNAME)}"
            
            # Publish with 15s timeout
            self.mqtt_connection.publish(
                topic=topic,
                payload=json.dumps(message),
                qos=mqtt.QoS.AT_LEAST_ONCE
            )
            logger.info(f"Published to '{topic}': {len(message)} bytes")
            
            # Disconnect gracefully
            disconnect_future = self.mqtt_connection.disconnect()
            disconnect_future.result(timeout=5)
            return True
        except Exception as e:
            logger.error(f"Failed to publish to AWS IoT Core: {e}")
            return False
        
    def _load_cache(self):
        """Load monitoring cache from JSON file"""
        try:
            if os.path.exists(MONITORING_CACHE_PATH):
                with open(MONITORING_CACHE_PATH, 'r') as f:
                    return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load monitoring cache: {e}")
        
        return {
            "last_updated": None,
            "containers": {},
            "history": []
        }
    
    def _load_config(self):
        """Load monitoring configuration (which services to focus on)"""
        try:
            if os.path.exists(MONITORING_CONFIG_PATH):
                with open(MONITORING_CONFIG_PATH, 'r') as f:
                    return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load monitoring config: {e}")
        
        # Default: monitor all containers
        return {
            "focus_services": [],  # empty = all services
            "ignore_services": [],
            "last_modified": datetime.now(timezone.utc).isoformat()
        }
    
    def _save_cache(self):
        """Save monitoring cache to JSON file"""
        try:
            with open(MONITORING_CACHE_PATH, 'w') as f:
                json.dump(self.cache, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save monitoring cache: {e}")
    
    def _save_config(self):
        """Save monitoring configuration"""
        try:
            with open(MONITORING_CONFIG_PATH, 'w') as f:
                json.dump(self.config, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save monitoring config: {e}")
    
    def update_focus(self, focus_services=None, ignore_services=None):
        """Update which services to focus on (called from chat interface)"""
        if focus_services is not None:
            self.config["focus_services"] = focus_services
        if ignore_services is not None:
            self.config["ignore_services"] = ignore_services
        self.config["last_modified"] = datetime.now(timezone.utc).isoformat()
        self._save_config()
        logger.info(f"Updated monitoring config: focus={focus_services}, ignore={ignore_services}")
    
    def poll_docker(self):
        """Poll Docker for container stats and status"""
        try:
            # Get list of running containers
            result = subprocess.run(
                ['docker', 'ps', '--format', '{{.Names}}\t{{.Status}}\t{{.ID}}'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode != 0:
                logger.error(f"Docker ps failed: {result.stderr}")
                # Keep previous state if Docker call fails
                return False
            
            containers_data = {}
            lines = result.stdout.strip().split('\n') if result.stdout.strip() else []
            
            if not lines:
                logger.warning("No running containers found")
            
            for line in lines:
                if not line:
                    continue
                parts = line.split('\t')
                if len(parts) >= 3:
                    name, status, container_id = parts[0], parts[1], parts[2]
                    
                    # Check if we should monitor this service
                    if not self._should_monitor(name):
                        continue
                    
                    containers_data[name] = {
                        "status": status,
                        "id": container_id,
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    }
                    
                    # Get container stats (non-blocking)
                    try:
                        stats = self._get_container_stats(container_id)
                        if stats:
                            containers_data[name].update(stats)
                    except Exception as stat_err:
                        logger.debug(f"Could not get stats for {name}: {stat_err}")
            
            # Update cache
            self.cache["containers"] = containers_data
            self.cache["last_updated"] = datetime.now(timezone.utc).isoformat()
            
            logger.info(f"Polled {len(containers_data)} containers")
            return True
            
        except subprocess.TimeoutExpired:
            logger.error("Docker ps timed out (>10s)")
            return False
        except Exception as e:
            logger.error(f"Error polling Docker: {e}")
            return False
    
    def _should_monitor(self, service_name):
        """Check if service should be monitored based on config"""
        focus = self.config.get("focus_services", [])
        ignore = self.config.get("ignore_services", [])
        
        # If focus list is empty, monitor all except ignored
        if not focus:
            return service_name not in ignore
        
        # If focus list exists, only monitor those not in ignore
        return service_name in focus and service_name not in ignore
    
    def _get_container_stats(self, container_id):
        """Get memory and CPU stats for a container"""
        try:
            result = subprocess.run(
                ['docker', 'stats', container_id, '--no-stream', '--format', 
                 '{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                parts = result.stdout.strip().split('\t')
                if len(parts) >= 3:
                    return {
                        "cpu_percent": parts[0].strip(),
                        "memory_usage": parts[1].strip(),
                        "memory_percent": parts[2].strip()
                    }
        except Exception as e:
            logger.debug(f"Error getting stats for {container_id}: {e}")
        
        return None
    
    def analyze_logs(self):
        """Analyze logs from /collect_data for errors and warnings"""
        errors = []
        warnings = []
        
        try:
            collect_data_path = Path("/collect_data")
            if not collect_data_path.exists():
                return {"errors": [], "warnings": []}
            
            # Scan for error/warning patterns in recent logs
            for log_file in collect_data_path.glob("*.log"):
                try:
                    with open(log_file, 'r') as f:
                        lines = f.readlines()[-100:]  # Last 100 lines
                        for line in lines:
                            if 'error' in line.lower():
                                errors.append(f"{log_file.name}: {line.strip()[:100]}")
                            elif 'warning' in line.lower() or 'warn' in line.lower():
                                warnings.append(f"{log_file.name}: {line.strip()[:100]}")
                except Exception as e:
                    logger.debug(f"Error reading {log_file}: {e}")
            
            # Limit to most recent
            return {
                "errors": errors[-10:],
                "warnings": warnings[-10:]
            }
        
        except Exception as e:
            logger.error(f"Error analyzing logs: {e}")
            return {"errors": [], "warnings": []}
    
    def _cleanup_old_history(self):
        """Remove history entries older than LOG_RETENTION_DAYS"""
        try:
            cutoff_date = (datetime.now(timezone.utc) - timedelta(days=LOG_RETENTION_DAYS)).isoformat()
            original_count = len(self.cache.get("history", []))
            
            self.cache["history"] = [
                entry for entry in self.cache.get("history", [])
                if entry.get("timestamp", "") >= cutoff_date
            ]
            
            removed = original_count - len(self.cache["history"])
            if removed > 0:
                logger.info(f"Cleaned up {removed} old history entries")
        except Exception as e:
            logger.error(f"Error cleaning up history: {e}")
    
    def generate_summary(self):
        """Generate a summary of current system health"""
        self._cleanup_old_history()
        
        # Get current state
        self.poll_docker()
        logs = self.analyze_logs()
        
        # Build summary
        summary = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "container_count": len(self.cache.get("containers", {})),
            "containers": self.cache.get("containers", {}),
            "errors_recent": logs.get("errors", []),
            "warnings_recent": logs.get("warnings", [])
        }
        
        # Add to history
        self.cache["history"].append(summary)
        self._save_cache()
        
        logger.info(f"Generated summary: {summary['container_count']} containers, "
                   f"{len(summary['errors_recent'])} errors, {len(summary['warnings_recent'])} warnings")
        
        # Publish to AWS IoT Core if critical findings
        if IOT_PUBLISH_ENABLED and (summary['errors_recent'] or summary['container_count'] == 0):
            severity = "critical" if summary['errors_recent'] or summary['container_count'] == 0 else "warning"
            self._publish_to_iot(summary, severity)
        
        return summary
    
    def run(self):
        """Main monitoring loop"""
        logger.info(f"Starting monitoring service (interval: {self.polling_interval}s)")
        
        while True:
            try:
                self.generate_summary()
                time.sleep(self.polling_interval)
            except Exception as e:
                logger.error(f"Error in monitoring loop: {e}")
                time.sleep(self.polling_interval)


if __name__ == "__main__":
    make_certs()
    monitor = MonitoringService()
    monitor.run()

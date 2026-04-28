import json
import os
import time
import logging
import subprocess
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Optional AWS IoT imports
try:
    from awscrt import io, mqtt, auth, http
    from awsiot import mqtt_connection_builder
    AWS_IOT_AVAILABLE = True
except ImportError:
    AWS_IOT_AVAILABLE = False
    logger = logging.getLogger(__name__)
    logger.debug("AWS IoT libraries not available, IoT publishing disabled")

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
        if not AWS_IOT_AVAILABLE:
            logger.debug("AWS IoT libraries not available, skipping IoT connection")
            return
        
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
                logger.error(f"Docker ps failed with return code {result.returncode}")
                logger.error(f"stderr: {result.stderr}")
                logger.error(f"stdout: {result.stdout}")
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
                    full_name, status, container_id = parts[0], parts[1], parts[2]
                    
                    # Clean container name - remove Balena UUID suffixes
                    # Names like "postgres_14770565_4033849_c99ff1b4230ce075ef177a3da4c2ebe1"
                    # become "postgres"
                    name = full_name.split('_')[0]
                    
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
    
    def _clean_log_line(self, line):
        """Clean up log lines - remove ANSI codes and excessive whitespace"""
        import re
        # Remove ANSI color codes
        ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
        line = ansi_escape.sub('', line)
        # Remove leading/trailing whitespace
        line = line.strip()
        # Remove common traceback noise (only keep error type + message)
        if 'traceback' in line.lower():
            return 'Traceback (see logs for details)'
        if line.startswith('File "/') or line.startswith('  '):
            return None  # Skip traceback frame lines
        return line
    
    def _parse_container_logs(self, container_id, container_name, last_timestamp):
        """Parse logs from a single container for errors and warnings"""
        errors = []
        warnings = []
        
        try:
            # Get recent logs with timestamps
            result = subprocess.run(
                ['docker', 'logs', '--tail', '100', '--timestamps', container_id],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode != 0:
                return {"errors": [], "warnings": []}
            
            # Parse log lines
            for line in result.stdout.split('\n'):
                if not line.strip():
                    continue
                
                # Extract timestamp if present (format: 2026-04-28T17:31:14.519Z message)
                try:
                    # Try to extract ISO timestamp from docker logs output
                    if line.startswith('2'):
                        parts = line.split(' ', 1)
                        if len(parts) >= 2:
                            timestamp_str = parts[0]
                            message = parts[1]
                        else:
                            timestamp_str = None
                            message = line
                    else:
                        timestamp_str = None
                        message = line
                except:
                    timestamp_str = None
                    message = line
                
                # Clean up the message
                cleaned_message = self._clean_log_line(message)
                if not cleaned_message:
                    continue
                
                # Check for errors and warnings
                message_lower = cleaned_message.lower()
                
                # Look for error patterns
                if any(pattern in message_lower for pattern in ['error', 'traceback', 'exception', 'failed', 'needs keyword-only argument']):
                    error_text = f"{container_name}: {cleaned_message[:150]}"
                    if error_text not in errors:
                        errors.append(error_text)
                
                # Look for warning patterns
                elif any(pattern in message_lower for pattern in ['warning', 'warn', 'deprecated']):
                    warning_text = f"{container_name}: {cleaned_message[:150]}"
                    if warning_text not in warnings:
                        warnings.append(warning_text)
            
            return {
                "errors": errors[-5:],  # Keep last 5 errors per container
                "warnings": warnings[-5:]
            }
        
        except subprocess.TimeoutExpired:
            logger.debug(f"Timeout reading logs for {container_name}")
            return {"errors": [], "warnings": []}
        except Exception as e:
            logger.debug(f"Error parsing logs for {container_name}: {e}")
            return {"errors": [], "warnings": []}
    
    def analyze_logs(self):
        """Analyze Docker container logs for errors and warnings"""
        errors = []
        warnings = []
        
        try:
            # Get current time for filtering recent errors
            cutoff_time = datetime.now(timezone.utc) - timedelta(seconds=self.polling_interval * 2)
            last_timestamp = cutoff_time.isoformat()
            
            # Parse logs from each running container
            for container_name, container_info in self.cache.get("containers", {}).items():
                container_id = container_info.get("id")
                if not container_id:
                    continue
                
                logs = self._parse_container_logs(container_id, container_name, last_timestamp)
                errors.extend(logs.get("errors", []))
                warnings.extend(logs.get("warnings", []))
            
            # Deduplicate and limit to most recent
            return {
                "errors": list(dict.fromkeys(errors))[-10:],
                "warnings": list(dict.fromkeys(warnings))[-10:]
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
        
        # Update top-level cache with current errors/warnings for chat service
        self.cache["errors_recent"] = logs.get("errors", [])
        self.cache["warnings_recent"] = logs.get("warnings", [])
        self.cache["last_updated"] = summary["timestamp"]
        
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
    logger.info("Monitor service starting...")
    logger.info(f"Cache path: {MONITORING_CACHE_PATH}")
    logger.info(f"Polling interval: {POLLING_INTERVAL} seconds")
    make_certs()
    monitor = MonitoringService()
    logger.info("Monitor service initialized, starting monitoring loop")
    monitor.run()

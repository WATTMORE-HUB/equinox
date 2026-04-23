import json
import os
import time
import logging
import subprocess
from datetime import datetime, timezone, timedelta
from pathlib import Path

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

# Ensure collect_data directory exists
Path("/collect_data").mkdir(parents=True, exist_ok=True)


class MonitoringService:
    def __init__(self):
        self.cache = self._load_cache()
        self.config = self._load_config()
        self.polling_interval = POLLING_INTERVAL
        
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
                return False
            
            containers_data = {}
            for line in result.stdout.strip().split('\n'):
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
                    
                    # Get container stats
                    stats = self._get_container_stats(container_id)
                    if stats:
                        containers_data[name].update(stats)
            
            # Update cache
            self.cache["containers"] = containers_data
            self.cache["last_updated"] = datetime.now(timezone.utc).isoformat()
            
            logger.info(f"Polled {len(containers_data)} containers")
            return True
            
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
    monitor = MonitoringService()
    monitor.run()

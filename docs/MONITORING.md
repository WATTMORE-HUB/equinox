# Equinox Monitoring Service Documentation

## Overview
The monitoring service runs in a background Docker container, periodically polling Docker container stats and analyzing logs. Results are cached in JSON for fast access by the chat interface and IoT Core publishing.

## Architecture

### Service Loop
```
Poll Docker (every 5 min) 
    → Collect container stats + logs 
    → Detect errors/warnings 
    → Cache results 
    → (Optional) Publish to IoT Core
```

## Cache Structure

### `/collect_data/monitoring_cache.json`
```json
{
  "last_updated": "2026-04-23T20:30:00.000000+00:00",
  "containers": {
    "service-name": {
      "status": "Up 2 hours",
      "id": "abc123def456",
      "timestamp": "2026-04-23T20:30:00.000000+00:00",
      "cpu_percent": "2.5%",
      "memory_usage": "128MiB",
      "memory_percent": "15.2%"
    }
  },
  "errors_recent": [
    "meter.log: ERROR: Failed to connect to modbus device",
    "inverter.log: ERROR: Timeout reading register 30039"
  ],
  "warnings_recent": [
    "combine.log: WARNING: High memory usage detected"
  ],
  "history": [
    {
      "timestamp": "2026-04-23T20:25:00.000000+00:00",
      "container_count": 5,
      "containers": { ... },
      "errors_recent": [ ... ],
      "warnings_recent": [ ... ]
    }
  ]
}
```

### `/collect_data/monitoring_config.json`
```json
{
  "focus_services": [],
  "ignore_services": [],
  "last_modified": "2026-04-23T20:30:00.000000+00:00"
}
```

- **focus_services**: Empty = monitor all. If populated, only monitor these services.
- **ignore_services**: Services to skip monitoring.
- Can be updated via future chat commands: "Monitor only service X"

## Data Collection

### Docker Polling
- **Command**: `docker ps --format '{{.Names}}\t{{.Status}}\t{{.ID}}'`
- **Stats**: `docker stats <container_id> --no-stream --format '{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}'`
- **Timeout**: 10 seconds per docker command
- **Frequency**: `MONITORING_INTERVAL` env var (default: 300s / 5 min)

### Log Analysis
- **Source**: `/collect_data/*.log` files
- **Pattern**: Scans last 100 lines of each log file
- **Detection**: Case-insensitive keywords: "error", "warning", "warn"
- **Limit**: Top 10 recent errors/warnings cached
- **Format**: `{filename}: {line excerpt (first 100 chars)}`

### History Cleanup
- **Retention**: 7 days (configurable via `LOG_RETENTION_DAYS`)
- **Cleanup Timing**: Runs at start of each `generate_summary()` call
- **Cutoff Date**: Removes entries older than 7 days UTC

## AWS IoT Core Publishing

### When Publishing Occurs
Publishing is triggered when **critical findings are detected**:
1. Any errors found in recent logs
2. Zero containers running (deployment failure)

### Message Format
```json
{
  "siteId": "value-from-SITE-env",
  "deviceId": "value-from-EDGE_ID-env",
  "edgeId": "value-from-BALENA_DEVICE_UUID-env",
  "alertOccurredAt": 1687550400000,
  "severity": "critical",
  "summary": {
    "containerCount": 5,
    "errorCount": 2,
    "warningCount": 1,
    "containers": { ... },
    "errorsRecent": [ ... ],
    "warningsRecent": [ ... ]
  }
}
```

### Publishing Configuration
```bash
IOT_PUBLISH_ENABLED=true                      # Enable feature
IOT_TOPIC=operate/device_reports              # Base topic
AWSENDPOINT=<aws-iot-endpoint>                # AWS IoT Core endpoint
THINGNAME=<device-id>                         # Device thing name
CERT_NAME=device.crt                          # Cert file name
CERT=<pem-content>                            # Certificate
KEY_NAME=private.key                          # Key file name
KEY=<pem-content>                             # Private key
CA_1_NAME=ca.crt                              # CA cert file name
CA_1=<pem-content>                            # CA certificate
```

### Topic Structure
`operate/device_reports/{BALENA_DEVICE_UUID}`

Example: `operate/device_reports/abc123def456789`

### Timeouts
- **Connection**: 15 seconds
- **Publish**: Immediate (queued)
- **Disconnect**: 5 seconds

## Performance Characteristics

### Resource Usage
- **Memory**: ~50MB baseline + 5-10MB per container
- **CPU**: <1% during polling, <5% during log analysis
- **Disk**: ~100KB per day (cache rotation)

### Polling Impact
```
Every MONITORING_INTERVAL seconds:
  - docker ps          (~0.1s)
  - docker stats       (~0.5-1s per container)
  - log scanning       (~0.5-2s depending on file sizes)
  - cache write        (~0.01s)
  Total: ~2-4 seconds, then sleep
```

## Configuration Options

### Environment Variables
```bash
MONITORING_INTERVAL=300          # Seconds between polls (default: 5 min)
LOG_RETENTION_DAYS=7             # Days to keep history (default: 7)
IOT_PUBLISH_ENABLED=false        # Enable IoT Core publishing
IOT_TOPIC=operate/device_reports # Base topic for publishing
```

### Filtering
To monitor only specific services, update `/collect_data/monitoring_config.json`:
```json
{
  "focus_services": ["combine", "heartbeat", "equinox"],
  "ignore_services": ["test-service"]
}
```

## Logging

### Monitor Service Logs
```bash
docker logs equinox-monitor -f
```

### Log Levels
- **INFO**: Summary generation, Docker polling counts
- **DEBUG**: Cache operations, skipped services
- **WARNING**: IoT publish failures, no containers found
- **ERROR**: Docker command failures, log analysis errors

### Common Log Messages
```
Generated summary: 5 containers, 1 errors, 0 warnings
Polled 5 containers
Published to 'operate/device_reports/xxx': 245 bytes
AWS IoT MQTT connection initialized
No running containers found
Docker ps failed: permission denied
```

## Troubleshooting

### No Data in Cache
1. Check `/collect_data` exists: `ls -la /collect_data/`
2. Check monitor container running: `docker ps | grep monitor`
3. Check Docker socket accessible: `docker -l /var/run/docker.sock`
4. Review logs: `docker logs equinox-monitor | tail -50`

### Errors Not Detected
1. Verify log files exist in `/collect_data`: `ls -la /collect_data/*.log`
2. Check file permissions: files must be readable by monitor container
3. Verify error keyword in logs matches detection patterns (case-insensitive)
4. Manually test detection by adding "ERROR" to test log

### IoT Publishing Failing
1. Check credentials configured: `echo $AWSENDPOINT | grep amazonaws`
2. Verify certs created: `ls -l /collect_data/{device.crt,private.key,ca.crt}`
3. Check network: `curl https://<AWSENDPOINT>/` (should error with SSL but connect)
4. Review logs for timeout: `docker logs equinox-monitor | grep -i iot`

### High CPU Usage
1. Increase `MONITORING_INTERVAL` from 300s to 600s or more
2. Reduce log file sizes or trim history
3. Reduce number of monitored containers
4. Check for runaway Docker process: `docker stats`

### Cache File Growing Too Large
1. Log files contain too much data - trim them
2. Reduce `MONITORING_INTERVAL` (less history)
3. Manually delete old entries: `jq '.history = .history[-100:]' /collect_data/monitoring_cache.json > temp && mv temp /collect_data/monitoring_cache.json`

## Integration with Chat Interface

The chat interface (`/api/chat`) reads this cache to answer questions:
- "How many containers?" → reads `containers` count
- "Any errors?" → reads `errors_recent` list
- "Memory usage?" → reads `memory_usage` and `memory_percent` from containers

Falls back to rule-based responses if cache is empty or invalid.

## See Also
- [EDGE_AI_SETUP.md](./EDGE_AI_SETUP.md) - Full setup guide
- [CHAT_INTERFACE.md](./CHAT_INTERFACE.md) - Chat UI user guide

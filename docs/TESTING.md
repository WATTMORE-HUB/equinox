# Testing Guide - LLM Deployment Manager

This guide covers testing all three core features: deployment, log analysis, and data validation.

## Pre-Testing Checklist

- [ ] Device is online and accessible via balena
- [ ] Port 80 is exposed and accessible
- [ ] State file exists at `/app/state.json` (or `/collect_data/state.json`)
- [ ] Docker socket is mounted (for log analysis)
- [ ] `collect_data` volume is mounted (for data validation)

## Feature 1: Service Deployment

### Test Scenario: Deploy a Test Service

1. **Access the Dashboard**
   - Open: `http://<device-ip>`
   - Should see the Deployment Form on the left

2. **Prepare Test Data**
   - Get your Balena auth token from balena-cloud.com
   - Get a valid device ID from your fleet
   - Create a test CSV with service config:
     ```csv
     name,service,jsonOutput
     camera,camera_control,camera_*.json
     meter,meter_collect,meter_*.json
     ```

3. **Submit Deployment**
   - Fill in Balena token and device ID
   - Upload CSV
   - Click "Deploy Services"
   - You should see: `✓ Deployment initiated! ID: deploy_...`

4. **Verify in State**
   - SSH into device: `balena device ssh <uuid>`
   - Check state: `cat /app/state.json | jq '.deployments[-1]'`
   - Should contain: `id`, `timestamp`, `deviceId`, `services`, `expectedJsonFiles`

### Expected Result
- Deployment recorded in state
- Status shows as "Deployed" 
- Card appears in "Active Deployments" section with checkmark

**Known Issue:** Deployment feature requires the configurator. If not available, error: "create-project.js not found". This is expected in standalone deployments.

---

## Feature 2: Data Validation

### Test Scenario: Create Test JSON Files and Validate

1. **Create Sample JSON Files**
   - SSH into device
   - Create files in `/collect_data`:
     ```bash
     echo '{"data": "test"}' > /collect_data/meter_001.json
     echo '{"data": "test"}' > /collect_data/camera_001.json
     ```

2. **Trigger Deployment During Test**
   - Submit a deployment (see Feature 1)
   - Validation automatically starts (10-minute window)

3. **Monitor Validation**
   - Dashboard updates every 5 seconds
   - Look for deployment card status line:
     - `⟳ Validating` - In active window
     - `✓ Valid` - All expected files found and fresh
     - `✗ Invalid` - Missing or stale files

4. **Check Errors**
   - If validation fails, error log shows missing files:
     ```
     "Expected JSON file not found: meter_*.json (stale)"
     ```

5. **Verify Validation Stops**
   - After 10 minutes, status changes to complete
   - Validation stops checking (`lastValidationCheck` stops updating)

### Expected Results
- Valid files are detected and green status shown
- Missing files trigger red status and error entry
- After 10 minutes, validation stops automatically
- Errors appear in deployment error log

### Edge Cases to Test
1. **Empty directory** - `collect_data` has no files
   - Expected: "Invalid" status, errors logged
2. **Stale files** - Files exist but not modified in 60+ seconds
   - Expected: "Invalid" status, "(stale)" notation in errors
3. **Pattern matching** - Files with wildcards in expected names
   - Test: `meter_*.json` matches `meter_001.json`, `meter_002.json`
   - Expected: All matching files detected

---

## Feature 3: Log Analysis

### Test Scenario: Trigger Log Analysis

1. **View Current Logs**
   - Device logs show: `[2026-04-20T17:00:00.199Z] Starting hourly log analysis...`
   - Runs automatically every hour

2. **Force Log Check**
   - Currently runs on schedule only
   - To test, check device logs after scheduled time:
     ```bash
     balena device logs <uuid> | grep "log analysis"
     ```

3. **Add Test Errors to Container**
   - SSH into device
   - Log into a service container:
     ```bash
     docker exec -it <service-name> sh
     ```
   - Output a log message with ERROR:
     ```bash
     echo "[ERROR] Test error message" >> /var/log/app.log
     ```

4. **Wait for Next Analysis**
   - Happens automatically at the top of each hour
   - Check state file for error entries:
     ```bash
     cat /app/state.json | jq '.deployments[-1].errorLog'
     ```

### Expected Results
- ERROR and WARNING logs are detected
- Errors appear in deployment's error log with timestamp
- Dashboard shows red status and error count when errors present

### Log Filtering Rules
- Detects: `[ERROR]`, `ERROR:`, `[WARNING]`, `WARNING:` (case-insensitive)
- Ignores: Non-matching log lines, INFO/DEBUG levels
- Stores: Last 1000 lines per container

---

## System Health Checks

### Server Status Check
```bash
curl http://<device-ip>/health
```
Expected response:
```json
{"status":"ok","timestamp":1234567890000}
```

### State File Integrity
```bash
cat /app/state.json | jq '.'
```
Should contain:
- `deployments` array (possibly empty)
- `lastLogCheck` timestamp
- `config` with intervals

### API Endpoints Test
```bash
# Get all deployments
curl http://<device-ip>/api/status/deployments

# Get specific deployment
curl http://<device-ip>/api/status/deployment/<deploymentId>

# Get errors
curl http://<device-ip>/api/status/errors/<deploymentId>

# View full state (debug)
curl http://<device-ip>/api/status/state
```

---

## Error Scenarios

### Scenario: Docker Socket Not Mounted
- **Symptom:** Device logs show `Error: connect ENOENT /var/run/docker.sock`
- **Cause:** Docker socket not mounted in docker-compose
- **Fix:** Add to docker-compose: `- /var/run/docker.sock:/var/run/docker.sock:ro`
- **Impact:** Log analysis fails, but system continues running

### Scenario: collect_data Directory Missing
- **Symptom:** Device logs show `collect_data path does not exist`
- **Cause:** Volume not mounted or directory doesn't exist
- **Fix:** Ensure docker-compose has: `- collect_data:/collect_data`
- **Impact:** Data validation can't run, but deployment proceeds

### Scenario: State File Corruption
- **Symptom:** Invalid JSON or missing fields
- **Cause:** Rare, but can happen with concurrent writes
- **Fix:** Delete state file, system recreates on next restart
- **Prevention:** File uses atomic writes (temp + rename)

---

## Performance Expectations

| Operation | Frequency | Duration | CPU Impact |
|-----------|-----------|----------|-----------|
| Deployment | On-demand | Instant | Low |
| Data validation | Every 30s (in window) | <100ms | Very low |
| Log analysis | Every hour | <5s per container | Low |
| UI refresh | Every 5s | <100ms | Very low |

---

## Troubleshooting Guide

**Problem:** Deployment card doesn't appear
- **Check:** Is deployment ID showing in API response? `curl /api/status/deployments`
- **Fix:** Reload browser, check state.json manually

**Problem:** Validation status stuck on "Validating"
- **Check:** Is 10-minute window still open? Check `validationEndTime` in state
- **Fix:** Wait for window to close, or restart container

**Problem:** Errors appearing for valid files
- **Check:** Are files actually in `/collect_data`? Check timestamps with `ls -la`
- **Fix:** Files must be modified within last 60 seconds to count as "fresh"

**Problem:** No error log entries despite errors
- **Check:** Are errors in the right format? Must contain `ERROR` or `WARNING`
- **Check:** Is Docker socket mounted? `docker ps` works on device?
- **Fix:** Add proper error formatting to services

---

## Success Criteria

All three features working correctly means:
- ✓ Deployments record to state.json with correct metadata
- ✓ Validation detects JSON files within 10-minute window
- ✓ Log analysis captures ERROR/WARNING level messages
- ✓ Dashboard displays all statuses in real-time
- ✓ State persists across container restarts
- ✓ No data loss on normal operations

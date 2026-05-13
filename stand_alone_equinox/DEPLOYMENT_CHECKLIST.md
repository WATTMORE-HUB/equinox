# Equinox Deployment Checklist

Use this checklist when adding Equinox to your existing Balena project.

## Pre-Deployment Preparation

- [ ] Have your Balena project root directory ready
- [ ] Backup your existing `docker-compose.yml` (if you have one)
- [ ] Have your Balena API token available (get from https://dashboard.balena-cloud.com/)
- [ ] Identify which devices will receive Equinox

## File Integration

- [ ] Copy all files from `stand_alone_equinox/` to your project root:
  ```bash
  cp -r stand_alone_equinox/* your-project/
  ```
  
- [ ] If you have an existing `docker-compose.yml`:
  - [ ] Back it up first
  - [ ] Add the `equinox` service section to your file (don't replace the whole file)
  - [ ] Keep your existing services intact
  - [ ] See SETUP_GUIDE.md section "Merging docker-compose.yml" for guidance

- [ ] If you don't have a `docker-compose.yml`:
  - [ ] The provided `docker-compose.yml` is ready to use as-is

- [ ] Verify file presence:
  ```bash
  ls -la your-project/src/
  ls -la your-project/public/
  ls -la your-project/Dockerfile
  ls -la your-project/package.json
  ```

## Environment Variables

**No setup needed.** All credentials are pre-configured in `docker-compose.yml`.

The package is ready to deploy as-is to your older devices, exactly like it runs on OfficeLab.

**Optional:** If you want to customize settings, see SETUP_GUIDE.md for:
- `EQUINOX_MODE` (configure vs monitor)
- `LOG_CHECK_INTERVAL` (log analysis frequency)
- `MONITORING_INTERVAL` (monitor polling rate)

## Deployment

- [ ] Verify you're in your project root directory:
  ```bash
  pwd  # Should show your-balena-project/
  ls -la Dockerfile package.json docker-compose.yml
  ```

- [ ] If pushing to a device named in `$BALENA_DEVICES` or similar:
  ```bash
  balena push your-device-name-or-ip
  ```
  OR
  ```bash
  git push balena main  # If using Balena cloud git deployment
  ```

- [ ] Monitor deployment:
  ```bash
  balena logs device-name equinox -f
  ```

- [ ] Wait for container to build and start (first push may take 5-10 minutes)

## Post-Deployment Verification

- [ ] Container is running:
  ```bash
  balena ps device-name
  # Should show equinox container in the list
  ```

- [ ] Health check passes:
  ```bash
  curl http://device-ip/health
  # Should return: {"status":"ok"}
  ```

- [ ] Dashboard loads:
  - [ ] Open browser to: `http://device-ip/`
  - [ ] Dashboard should display (may take 30 seconds)

- [ ] Check logs for errors:
  ```bash
  balena logs device-name equinox | tail -50
  # Should not show critical errors
  ```

## Port Configuration

- [ ] Verify port 80 isn't already in use on the device
  - [ ] If another service uses port 80, modify docker-compose.yml to use a different port
  - [ ] Example: Change `"80:80"` to `"8080:80"` to use port 8080

## Configuration (After First Boot)

### If Running in Configuration Mode

- [ ] Access dashboard at `http://device-ip/`
- [ ] Dashboard should show deployment form
- [ ] Try test deployment to another device (optional)
- [ ] Verify Docker socket is accessible (log analysis works)

### If Switching to Monitor Mode Later

- [ ] Set environment variable: `EQUINOX_MODE = monitor`
- [ ] Restart container (or wait for Balena to apply changes)
- [ ] Dashboard should now show chat interface
- [ ] Test by asking "what can you do?" in the chat

## Troubleshooting Checklist

**If dashboard doesn't load:**
- [ ] Verify container is running: `balena ps device-name`
- [ ] Check port 80 is open: `curl http://device-ip/`
- [ ] Review logs: `balena logs device-name equinox`
- [ ] Restart container: `balena restart device-name equinox`

**If deployment fails (in Configuration Mode):**
- [ ] Verify `BALENA_API_TOKEN` is set: `balena env ls device-name | grep BALENA_API_TOKEN`
- [ ] Check token is valid (should work in Balena Dashboard)
- [ ] Verify Docker socket is mounted (check logs for mount errors)
- [ ] Ensure configurator directory exists: `ls src/configurator/`

**If state file keeps resetting:**
- [ ] Check `/collect_data` volume persists in docker-compose.yml
- [ ] Verify volume driver is `local`: `volumes: collect_data: driver: local`

**For other issues:**
- [ ] See SETUP_GUIDE.md Troubleshooting section
- [ ] Check Balena documentation: https://www.balena.io/docs/

## Multi-Device Deployment

To deploy Equinox to multiple devices:

- [ ] Set `BALENA_API_TOKEN` on each device individually (via Dashboard)
- [ ] Push same codebase to each device:
  ```bash
  for device in device1 device2 device3; do
    balena push $device
  done
  ```
- [ ] Verify each device:
  ```bash
  curl http://device1-ip/health
  curl http://device2-ip/health
  curl http://device3-ip/health
  ```

## Final Sign-Off

- [ ] All environment variables set ✓
- [ ] Files copied to project root ✓
- [ ] docker-compose.yml merged (if needed) ✓
- [ ] Deployment successful ✓
- [ ] Health check passes ✓
- [ ] Dashboard loads ✓
- [ ] No critical errors in logs ✓

**Ready to use Equinox!**

---

## Need Help?

1. **Setup questions?** → See SETUP_GUIDE.md
2. **Environment variables?** → See SETUP_GUIDE.md Environment Variables Reference
3. **Troubleshooting?** → See SETUP_GUIDE.md Troubleshooting section
4. **Balena-specific issues?** → https://www.balena.io/docs/

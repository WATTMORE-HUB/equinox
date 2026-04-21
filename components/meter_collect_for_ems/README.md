# Meter Collect for EMS

A containerized service that collects electrical meter data from energy meters using the Modbus protocol and writes the collected data to JSON files. This is a stand-alone Dockerized version of the software that typically runs on balenaOS.

## Overview

This service reads electrical measurements from Modbus-compatible meters via either:
- **RTU mode**: Serial connection over USB
- **TCP mode**: Network connection via Ethernet

The collected data is periodically written to JSON files that can be consumed by other services.

## What It Does

- Connects to an electrical meter using Modbus protocol (RTU or TCP)
- Reads register values for power, voltage, current, energy sum, frequency, and device serial number
- Applies scaling factors to raw readings
- Writes collected data as JSON files to `/collect_data/meter/` with timestamp filenames
- Includes device and site metadata in each JSON payload
- Runs continuously with a 30-second polling interval

## Running the Service

### Using Docker Compose

1. **Configure the service** by editing `docker-compose.yml`:
   - Set `MODBUS_MODE` to either `"RTU"` or `"TCP"`
   - For RTU: Adjust `devices` mapping to match your USB serial adapter (commonly `/dev/ttyUSB0` or `/dev/ttyACM0`)
   - For TCP: Set `IP_PART_1` through `IP_PART_4` to form the meter's IP address
   - Update register addresses under the "Modbus register addresses" section for your specific meter
   - Adjust scaling factors (`M_POWER_SCALE`, `M_VOLT_SCALE`, etc.) if needed
   - Set device/site metadata (`DEVICE_ID`, `DEVICE_READABLE_NAME`, `SITE`, etc.)

2. **Start the service**:
   ```bash
   docker compose up
   ```

3. **View logs**:
   ```bash
   docker compose logs -f meter_collect
   ```

4. **Stop the service**:
   ```bash
   docker compose down
   ```

## Configuration

All configuration is done via environment variables in `docker-compose.yml`:

| Variable | Purpose | Example |
|----------|---------|---------|
| `MODBUS_MODE` | Connection type | `"RTU"` or `"TCP"` |
| `IP_PART_1-4` | TCP target IP address | `192`, `168`, `1`, `100` |
| `USB` | RTU serial port inside container | `"/dev/ttyACM0"` |
| `REGISTER_BASE` | Number base for parsing register addresses | `10` (decimal) or `16` (hex) |
| `FUNCTION_CODE` | Modbus function code | `3` (Read Holding Registers) |
| `M_*_SCALE` | Scaling factors for readings | `1` to `0.001` |
| `DEVICE_ID` / `METER_DEVICE_ID` | Device identifier | User-defined |
| `POW_A`, `VOLT_A`, `CURR_A`, etc. | Register addresses | Hex or decimal based on `REGISTER_BASE` |

## Output

Collected data is written to JSON files in `/collect_data/meter/` with timestamp filenames.

## Requirements

- Docker and Docker Compose
- For RTU mode: USB-to-serial adapter connected to the meter
- For TCP mode: Network connectivity to the meter's IP address

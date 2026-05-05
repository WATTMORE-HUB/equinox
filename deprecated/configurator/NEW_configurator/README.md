# EnForm Configurator CSV

This is the CSV version of the EnForm Configurator. Unlike the original version that requires manual input for each variable, this version reads variable names and values directly from a CSV file.

## Features

- **CSV File Input**: Upload a CSV file with variable names and values
- **Automatic Processing**: No manual input required - all variables are read from the CSV
- **Preview**: Review all variables before sending to Balena API
- **Progress Tracking**: Real-time progress when sending variables via API
- **Error Handling**: Detailed error reporting for failed API calls
- **Download Configuration**: Save the generated JSON configuration locally
- **Service Selection**: Choose which IoT services to include in your project
- **Project Generation**: Automatically create complete Docker project structure
- **Balena Deployment**: One-click deployment to Balena Cloud with CLI integration

## Setup

### Quick Start (Recommended)

**Option 1: Using setup script**
```bash
./setup.sh
npm start
```

**Option 2: Manual setup**
1. **Install dependencies**:
   ```bash
   npm install express cors
   ```

2. **Start the server**:
   ```bash
   npm start
   # or
   node server.js
   ```

3. **Open the configurator**:
   Open your browser to `http://localhost:3001/index.html`

### Manual Setup (No Server)

If you prefer not to run the server, you can:
1. Open `index.html` directly in your browser
2. Use the command-line tool manually when prompted

## How to Use

### Step 1: Prepare Your CSV File

Create a CSV file with two columns:
1. **Variable Name** (first column)
2. **Variable Value** (second column)

**Format Requirements:**
- Use comma (`,`) as the delimiter
- No header row required
- One variable per line
- Empty lines are ignored
- Duplicate variable names will use the latest value

**Example CSV format:**
```csv
API_KEY,your_api_key_here
DATABASE_URL,postgresql://user:password@localhost:5432/mydb
DEBUG_MODE,true
MAX_CONNECTIONS,100
TIMEOUT_SECONDS,30
```

### Step 2: Configure Variables (Optional)

**Option A: Configure Variables**
1. Open `index.html` in your web browser
2. Enter your **Balena Bearer Token**
3. Enter your **Balena Device ID**
4. Upload your CSV file (drag & drop or click to browse)
5. Click "Process Configuration"

**Option B: Skip Variables**
1. Open `index.html` in your web browser
2. Click "Skip Variables - Go to Service Selection" to bypass variable configuration

### Step 3: Review and Send to Balena (If Not Skipped)

1. Review the loaded variables in the preview table
2. Click "Send via Balena API" to transmit all variables
3. Monitor the progress and see results for each variable

### Step 4: Select Services and Create Project

1. Click "Continue to Service Selection" (or you'll be here if you skipped variables)
2. Enter a **Project Name** for your deployment
3. **Select Services** you want to include:
   - **Camera**: Video server and camera control
   - **Meter**: Energy meter data collection
   - **Inverter**: Solar inverter monitoring
   - **Weather Station**: Weather data collection
   - **Windspeed**: Wind speed monitoring
4. Click "Create Project"

### Step 5: Project Creation

1. The system will create a new project directory in `finished_projects/`
2. Monitor the progress as files are copied and configured
3. View the project summary with included services
4. Choose to deploy immediately or finish

### Step 6: Deploy to Balena (Optional)

1. Click "🚀 Deploy to Balena" to start the deployment process
2. Enter your **Balena Application Name** (fleet name)
3. **Check Prerequisites**:
   - ✅ Balena CLI is installed (`npm install -g balena-cli`)
   - ✅ Logged into Balena CLI (`balena login`)
   - ✅ Balena application exists (create in dashboard or CLI)
4. Click "Start Deployment"
5. The system will attempt automatic deployment or provide manual instructions

### Step 7: Monitor Deployment

1. View deployment progress and logs
2. Open Balena Dashboard to monitor build status
3. Check device updates once deployment completes

## Project Structure

When you create a project, the following structure is generated:

```
finished_projects/
└── your-project-name/
    ├── docker-compose.yml      # Modified based on selected services
    ├── license.md              # License file
    ├── requirements.txt        # Python dependencies
    ├── src/                    # Python source files
    │   ├── combine.py          # Always included
    │   ├── heartbeat.py        # Always included
    │   └── [service files]     # Based on selection
    ├── [service].Dockerfile    # Docker build files
    └── templates/              # Only if Camera is selected
```

## Sample Files

- `sample_variables.csv` - Example CSV file showing the correct format

## Differences from Original Configurator

| Feature | Original | CSV Version |
|---------|----------|-------------|
| **Input Method** | Manual entry for each variable | CSV file upload |
| **Variable Values** | User types each value | Pre-defined in CSV |
| **Process** | Step-by-step variable entry | Bulk processing |
| **Preview** | Variable navigation | Table preview |
| **Use Case** | Interactive configuration | Batch configuration |

## CSV File Tips

1. **Quotes**: Use quotes around values that contain commas:
   ```csv
   DESCRIPTION,"A value with, commas in it"
   ```

2. **Special Characters**: Values can contain spaces and special characters:
   ```csv
   WELCOME_MESSAGE,Hello World! Welcome to our app.
   ```

3. **Numeric Values**: Numbers don't need quotes:
   ```csv
   PORT,8080
   MAX_RETRIES,3
   ```

4. **Boolean Values**: Use string representations:
   ```csv
   ENABLE_LOGGING,true
   DEBUG_MODE,false
   ```

## Error Handling

The configurator handles various error conditions:
- Invalid CSV format
- Missing values
- Duplicate variable names (uses latest)
- API failures (detailed error messages)
- Network issues

## Browser Support

This tool works in modern web browsers that support:
- File API
- Fetch API
- ES6 classes and arrow functions
- CSS Grid/Flexbox

## Command Line Project Creation

For advanced users or automation, you can create projects directly from the command line:

```bash
# Create a project with specific services
node create-project.js my-solar-project camera,inverter,weather

# Create a project with only the default services (combine, heartbeat)
node create-project.js basic-project
```

**Available Services:**
- `camera` - Video server and camera control
- `meter` - Energy meter data collection
- `inverter` - Solar inverter monitoring
- `weather` - Weather station data collection
- `windspeed` - Wind speed monitoring

**What it does:**
1. Creates a new directory in `finished_projects/`
2. Copies base files (docker-compose.yml, license.md, requirements.txt)
3. Copies service-specific files to appropriate locations
4. Comments out unused services in docker-compose.yml
5. Creates proper directory structure

## Service Details

### Always Included Services
- **Combine**: Data aggregation and processing (`combine.py`)
- **Heartbeat**: System monitoring and health checks (`heartbeat.py`)
- **Postgres**: Database for data storage

### Optional Services
- **Camera** (`camera_control`): 
  - Copies `app.Dockerfile` and `app.py`
  - Includes `templates/` directory for web interface
  - Enables `video-server` in docker-compose.yml

- **Meter** (`meter_collect`):
  - Copies `meter_collect.Dockerfile` and `meter_collect.py`
  - Enables `operate-meter-collect` in docker-compose.yml

- **Inverter** (`inverter_collect`):
  - Copies `inverter_collect.Dockerfile` and `inverter_collect.py`
  - Enables `operate-inverter-collect` in docker-compose.yml

- **Weather Station** (`weather_collect`):
  - Copies `weather_collect.Dockerfile` and `weather_collect.py`
  - Enables `operate-weather-collect` in docker-compose.yml

- **Windspeed** (`windspeed_collect`):
  - Copies `windspeed_collect.Dockerfile` and `windspeed_collect.py`
  - Enables `operate-windspeed-collect` in docker-compose.yml

## Security Notes

- Bearer tokens are only stored in memory during the session
- No data is sent to external servers except the Balena API
- CSV files are processed locally in the browser
- All API calls use HTTPS encryption
- Project creation is done locally on your machine

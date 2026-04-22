# Wattmore Configurator

An internal-only website for creating JSON configuration files and setting environment variables via Balena API for Wattmore devices.

## Overview

The Wattmore Configurator is a web-based tool that helps generate JSON configuration files containing device variables and their values. Each JSON entry follows the format specified in `example.json` with three keys: `device`, `name`, and `value`.

## Features

- **Balena Integration**: Direct API integration with Balena Cloud for setting environment variables
- **Bearer Token Authentication**: Secure authentication using Balena Bearer Tokens
- **File Upload**: Upload your own .txt file containing variable names (one per line)
- **Flexible Variables**: Support for any number of variables (1 to hundreds)
- **Dual Output Options**: Choose between downloading JSON or sending via Balena API
- **Step-by-Step Input**: Guided interface for entering values for each variable
- **Optional Fields**: Skip variables by leaving them blank
- **Progress Tracking**: Visual progress bar for both configuration and API sending
- **Real-time API Feedback**: Live status updates during API calls with success/error reporting
- **JSON Generation**: Creates properly formatted JSON output
- **File Download**: Downloads the result as `total_variables.json`

## Files

- `index.html` - Main web interface
- `styles.css` - Styling for professional appearance
- `script.js` - JavaScript functionality
- `example.json` - Template showing the required JSON format
- `result_example.json` - Example of the expected output format
- `sample_variables.txt` - Example variables file for testing

## Variables File Format

Your variables file should be a plain text (.txt) file with:
- One variable name per line
- No empty lines (they will be ignored)
- Variable names should not contain special characters

Example:
```
AC_OUTPUT_POWER
GRID_FREQUENCY
L1_CURRENT
INVERTER_TEMPERATURE
```

## Usage

1. **Open the Configurator**: Open `index.html` in a web browser
2. **Enter Bearer Token**: Input your Balena Bearer Token for API authentication
3. **Upload Variables File**: Choose a .txt file containing variable names (one per line)
4. **Enter Balena UUID**: Input the Balena device UUID that will be used for all entries
5. **Start Configuration**: Click "Start Configuration" to begin
6. **Configure Variables**: Go through each variable and enter its value (or skip by leaving blank)
7. **Generate Configuration**: Review and generate the final configuration
8. **Choose Output Method**:
   - **📁 Download JSON File**: Download the `total_variables.json` file
   - **🚀 Send via Balena API**: Automatically send all variables to Balena Cloud via API calls

## Output Format

The generated JSON file contains an array of objects, each with:
```json
{
  "device": "<DEVICE_ID>",
  "name": "<VARIABLE_NAME>",
  "value": "<VARIABLE_VALUE>"
}
```

## Technical Details

- Pure client-side application (HTML, CSS, JavaScript)
- No server required - runs entirely in the browser
- Variables are embedded in the JavaScript for simplicity
- Removes duplicate variables automatically
- Responsive design for mobile and desktop use

## Browser Compatibility

- Modern browsers with ES6+ support
- Chrome, Firefox, Safari, Edge (recent versions)

## Development

To modify the variable list:
1. Edit `variables.txt` with the new variables
2. Update the embedded variables string in `script.js`
3. Refresh the page to see changes

## Security

This is an internal-only tool. Do not deploy to public servers or share with external parties.

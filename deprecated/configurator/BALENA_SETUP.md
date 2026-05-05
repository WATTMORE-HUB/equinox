# Balena Setup Guide

## Getting Your Balena Bearer Token

To use the API functionality of the Wattmore Configurator, you'll need a Balena Bearer Token.

### Steps to Get Your Token:

1. **Log in to Balena Cloud**
   - Go to https://balena-cloud.com/
   - Sign in to your account

2. **Access Your Profile**
   - Click on your profile/avatar in the top right
   - Select "Preferences" or "Account Settings"

3. **Generate API Key**
   - Look for "API Keys" or "Access Tokens" section
   - Click "Create API Key" or "Generate New Token"
   - Give it a descriptive name (e.g., "Wattmore Configurator")
   - Copy the generated token immediately (you won't be able to see it again)

4. **Keep Your Token Safe**
   - Store it securely (password manager recommended)
   - Never share it publicly or commit it to version control
   - The configurator uses password field to protect it from shoulder surfing

### Finding Your Device UUID

1. **Go to Your Application**
   - Navigate to your Balena application dashboard

2. **Select Your Device**
   - Click on the device you want to configure

3. **Copy the UUID**
   - The device UUID is shown in the device summary
   - It looks like: `66a45de3-9bd9-443c-a48c-c4411aa1b6b3`

## API Endpoint Used

The configurator uses this Balena API endpoint:
```
POST https://api.balena-cloud.com/v7/device_environment_variable
```

With the payload structure:
```json
{
    "device": "<BALENA_UUID>",
    "name": "<VARIABLE_NAME>",
    "value": "<VARIABLE_VALUE>"
}
```

## Security Notes

- Your Bearer Token has full access to your Balena account
- Only use this configurator on trusted devices
- The token is stored temporarily in memory and cleared when you start over
- Consider creating a dedicated service account with limited permissions if available

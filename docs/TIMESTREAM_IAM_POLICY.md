# Timestream Query IAM Policy

To enable Equinox devices to query AWS Timestream for data freshness checks, add the following permissions to the IAM policy attached to your device credentials.

## Full Policy Statement

Replace your device IAM policy with this complete policy that includes existing IoT permissions plus Timestream query access:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "iot:Connect",
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": "iot:Publish",
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": "iot:Receive",
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": "iot:Subscribe",
      "Resource": "*"
    },
    {
      "Sid": "TimestreamQueryAccess",
      "Effect": "Allow",
      "Action": [
        "timestream:Select"
      ],
      "Resource": [
        "arn:aws:timestream:us-east-2:*:database/operateSolarDB-prod/table/electric_metering",
        "arn:aws:timestream:us-east-2:*:database/operateSolarDB-prod/table/recloser_monitoring",
        "arn:aws:timestream:us-east-2:*:database/operateSolarDB-prod/table/single-axis-tracker",
        "arn:aws:timestream:us-east-2:*:database/operateSolarDB-prod/table/solar_inverters",
        "arn:aws:timestream:us-east-2:*:database/operateSolarDB-prod/table/tracker_monitoring",
        "arn:aws:timestream:us-east-2:*:database/operateSolarDB-prod/table/weather_stations"
      ]
    }
  ]
}
```

## Setup Instructions

1. **Identify the IAM policy** attached to your Balena device credentials (the credentials used for AWS IoT Core publishing).

2. **Add the above statement** to that existing policy, or create a new inline policy with this statement if you don't have one yet.

3. **Note the AWS region** - the policy above uses `us-east-2`. If your Timestream database is in a different region, update the region in the ARNs accordingly.

4. **No changes needed on the device** - the Equinox application will automatically use the AWS SDK credentials already configured for IoT publishing to query Timestream.

## What This Allows

With this policy in place, the device can:
- Query the latest data point from each of the 6 monitored Timestream tables
- Check data freshness by comparing timestamps
- Detect blank (null-value) rows
- Report whether data is flowing to the cloud

## Verification

Once the policy is attached, test the feature in monitor mode chat:

```
User: "Is data being uploaded?"
Equinox: "Within what time span should the data be fresh? Please specify: 5 minutes, 10 minutes, 30 minutes, or 1 hour."
User: "5 minutes"
Equinox: [Returns table-by-table freshness status]
```

If you see a permissions error, verify the policy statement is attached to the correct IAM role/user and that the region and table names match your actual Timestream setup.

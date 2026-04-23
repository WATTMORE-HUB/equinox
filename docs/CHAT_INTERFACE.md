# Equinox Chat Interface User Guide

## Overview
After Equinox deployment configuration completes, the dashboard shifts to monitor mode. The chat interface provides a conversational way to query system health, container status, and identify issues without reading logs manually.

## Accessing the Chat Interface

### URL
```
http://<device-ip>/
```

Replace `<device-ip>` with the IP address or hostname of your Equinox device.

### Device States
- **Configuration Mode** (before setup): Shows deployment configuration form
- **Monitor Mode** (after setup): Shows chat interface

The dashboard automatically detects the device state and displays the appropriate interface.

## Using the Chat

### Asking Questions
1. Click the input field at the bottom: "Ask about system health..."
2. Type your question (1-500 characters)
3. Press **Enter** or click **Send** button
4. Wait for the system to respond (typically <5 seconds)

### Your Questions Show in Blue
Messages you send appear as blue bubbles on the right side of the chat.

### System Responses Show in Gray
Responses from the monitoring system appear as gray bubbles on the left side.

## Question Examples

### Health & Status
- "Are all services healthy?"
- "What's the system status?"
- "Is everything running?"
- "Any problems detected?"

### Container Information
- "How many containers are running?"
- "What services are active?"
- "Show running containers"
- "List services"

### Resource Usage
- "What's the memory usage?"
- "How much CPU are we using?"
- "Memory status?"
- "CPU per container?"

### Error Detection
- "Any errors in logs?"
- "Are there warnings?"
- "What went wrong?"
- "Show recent errors"

### Specific Service Queries
- "What's the status of [service-name]?"
- "Memory usage of [service-name]?"
- "Is [service-name] running?"

## How the System Responds

### Smart Responses
The system analyzes the monitoring cache (updated every 5 minutes) and provides context-aware answers:

```
Example question: "Are all services healthy?"
Example response: "✓ System is healthy. 5 containers running."
```

```
Example question: "Any errors?"
Example response: "Found 1 error:
meter.log: ERROR: Failed to connect to modbus device"
```

### Fallback Mode
If the LLM (AI model) is unavailable, the system uses intelligent rule-based responses:
- Still accurate for simple questions
- Based on real monitoring data
- No AI inference needed

### "Analyzing..." State
While the system processes your question, you'll see "Analyzing..." below your message. Wait for the response to appear.

## Chat History

### Session Memory
The chat remembers all messages in your current session. Scroll up to see previous questions and answers.

### What Happens on Refresh
- Closing the browser tab or refreshing the page clears chat history
- A new session starts fresh with the greeting: "System monitoring active. How can I help?"
- Previous monitoring data is preserved (in `/collect_data/monitoring_cache.json`)

### No Cloud Sync
Chat history is **not sent to any server** and does not survive browser refresh. It's local to your current session for privacy.

## Troubleshooting Chat

### Response Takes >5 Seconds
- System may be under load
- Monitor service may be running a log analysis
- Try again - responses should be faster on second attempt

### "Unable to Process Question"
1. Rephrase your question more simply
2. Check if device has internet (for AI model to load)
3. Wait 30 seconds for monitoring service to collect new data
4. Try a simpler question like "How many containers?"

### Empty Chat on Load
1. This is normal - wait for monitoring service to collect first data
2. Device may have just started (takes ~5 minutes for first cache)
3. Try asking "Any errors?" to trigger a response

### Getting Generic Responses
The system uses intelligent fallback when detailed analysis unavailable:
- Still factually accurate
- Based on most recent monitoring data
- No AI processing required

This is fine! Device still works without advanced AI.

## Advanced Features (Coming Soon)

### Planned Features
- Filter questions to specific services: "Monitor only [service]"
- Set alert thresholds: "Alert me if CPU > 80%"
- Get recommendations: "What should I optimize?"
- Export reports: "Show me a 24-hour summary"

## Dashboard Interface Details

### Visual Elements
- **Blue pulsing light** in center: Indicates system is active and monitoring
- **Message bubbles**: Your questions (blue, right) vs system responses (gray, left)
- **Input field**: At bottom - type here to ask questions
- **Send button**: Click to submit, or press Enter

### Responsive Design
- Works on mobile, tablet, and desktop
- Touch-friendly buttons and input
- Auto-scrolls to latest message

## Performance Tips

### For Slower Devices
1. Ask simpler questions (single concept)
2. Wait longer between questions (5-10 seconds)
3. Check if LLM model is loaded (monitoring uses less resources)
4. Restart device if responses slow significantly

### For Faster Results
1. Ask about recent errors (cached data)
2. Ask container counts (quick to poll)
3. Avoid asking about historical trends (requires log scanning)

## FAQ

**Q: Is my chat history stored anywhere?**
A: No. It's only in your browser for this session. Refresh the page and it's gone.

**Q: Can I ask questions offline?**
A: Yes, but responses will be based only on cached data (up to 5 minutes old).

**Q: What if I ask something the system doesn't understand?**
A: The system tries its best to provide relevant information from monitoring data. If confused, try rephrasing or asking about containers/errors/resources directly.

**Q: How often is the monitoring data updated?**
A: Every 5 minutes by default (configurable). Chat reflects the most recent data in `/collect_data/monitoring_cache.json`.

**Q: Can multiple people chat at once?**
A: Yes - each browser tab has its own independent chat session with independent history.

**Q: Why are responses sometimes short?**
A: To keep information concise and readable. The system focuses on the most important details.

**Q: What language does the system understand?**
A: English. Questions in English work best.

## See Also
- [EDGE_AI_SETUP.md](./EDGE_AI_SETUP.md) - Setup and configuration
- [MONITORING.md](./MONITORING.md) - How monitoring works behind the scenes

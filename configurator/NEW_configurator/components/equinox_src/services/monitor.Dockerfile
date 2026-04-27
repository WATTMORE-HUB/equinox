FROM python:3.11-slim

WORKDIR /app

# Install Docker CLI (needed for docker ps, docker stats)
RUN apt-get update && apt-get install -y docker.io && rm -rf /var/lib/apt/lists/*

# Copy monitoring service (relative to root context)
COPY equinox_src/services/monitor.py /app/monitor.py

# Environment variables
ENV MONITORING_INTERVAL=300
ENV PYTHONUNBUFFERED=1

# Run monitoring service
CMD ["python", "monitor.py"]

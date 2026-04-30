FROM python:3.11-slim

WORKDIR /app

# Install Docker CLI (needed for docker ps, docker stats)
RUN apt-get update && apt-get install -y docker.io && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy monitoring service
COPY src/services/monitor.py /app/monitor.py

# Environment variables
ENV MONITORING_INTERVAL=300
ENV PYTHONUNBUFFERED=1

# Run monitoring service
CMD ["python", "monitor.py"]

# Plain Docker image for running meter_collect.py on a regular (e.g. Ubuntu) host.
FROM python:3.13-slim-bookworm

# Set our working directory
WORKDIR /usr/src/app

# Ensure stdout/stderr are unbuffered so logs flow straight to `docker logs`
ENV PYTHONUNBUFFERED=1

# Copy requirements.txt first for better layer caching
COPY requirements.txt requirements.txt

# Install Python deps
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application source
COPY . ./

# Run the collector when the container starts
CMD ["python", "-u", "meter_collect.py"]

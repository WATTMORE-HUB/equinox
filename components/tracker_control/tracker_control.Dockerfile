FROM python:3.11-slim-bookworm

# Install curl for making requests and other utilities
RUN apt-get update && apt-get install -y \
    curl \
    iputils-ping \
    net-tools \
    && rm -rf /var/lib/apt/lists/*

# Set our working directory
    WORKDIR /usr/src/app
    
    # Copy requirements.txt first for better cache on later pushes
    COPY requirements.txt requirements.txt
    
    # pip install python deps from requirements.txt on the resin.io build server
    RUN pip install -r requirements.txt
    
    # This will copy all files in our root to the working  directory in the container
    COPY . ./
    
    # main.py will run when container starts up on the device
    CMD ["python","-u","src/tracker_control.py"]
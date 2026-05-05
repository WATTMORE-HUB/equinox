#!/usr/bin/env python3
"""
Dockerized AJAX Client

This script runs inside a Docker container and makes requests through
the OpenVPN container via Docker network communication.
"""

import json
import time
import requests
import os
import subprocess
from datetime import datetime
from requests.auth import HTTPBasicAuth
import logging
from sys import stdout

logger = logging.getLogger(__name__)

logger.setLevel(logging.DEBUG)
logFormatter = logging.Formatter("%(name)-12s %(asctime)s %(levelname)-8s %(filename)s:%(funcName)s %(message)s")
consoleHandler = logging.StreamHandler(stdout)
consoleHandler.setFormatter(logFormatter)
logger.addHandler(consoleHandler)


def wait_for_vpn_connection(max_attempts=30, delay=2):
    """
    Wait for VPN connection to be established by checking if we can reach the target network.
    """
    target_ip = os.getenv('TARGET_IP', '10.16.49.164')
    
    print(f"Waiting for VPN connection to {target_ip}...")
    
    for attempt in range(max_attempts):
        try:
            # Try to ping the target IP through the VPN
            result = subprocess.run(
                ['ping', '-c', '1', '-W', '3', target_ip],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode == 0:
                print(f"VPN connection established! Can reach {target_ip}")
                return True
                
        except (subprocess.TimeoutExpired, subprocess.CalledProcessError):
            pass
        
        print(f"Attempt {attempt + 1}/{max_attempts}: VPN not ready, waiting {delay}s...")
        time.sleep(delay)
    
    print("Timeout waiting for VPN connection")
    return False


def make_single_ajax_request(url, username, password, cmd, prm1):
    """
    Make a single AJAX request to a specific URL with specified parameters.
    """
    # Prepare the AJAX parameters
    params = {
        'cmd': cmd,
        'prm1': prm1
    }
    
    try:
        print(f"Trying POST to endpoint: {url}")
        print(f"POST data: {params}")
        
        # Make the POST request with basic auth
        response = requests.post(
            url,
            data=params,
            auth=HTTPBasicAuth(username, password),
            timeout=15,
            headers={
                'Accept': 'application/json, text/plain, */*',
                'X-Requested-With': 'XMLHttpRequest',
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            verify=False  # Skip SSL verification for self-signed certs
        )
        
        print(f"Response: {response.status_code} {response.reason}")
        
        if response.status_code == 200:
            print("Success! Got response from server")
            
            # Try to parse as JSON
            try:
                return response.json()
            except json.JSONDecodeError:
                print("Response is not JSON, returning text content")
                return {
                    "response_text": response.text[:1000],  # Limit text length
                    "content_type": response.headers.get('content-type', 'unknown'),
                    "status_code": response.status_code
                }
                
        elif response.status_code == 401:
            print("Authentication failed - check username/password")
            return {
                "error": "Authentication failed",
                "status_code": 401,
                "response_text": response.text[:500]
            }
        elif response.status_code == 404:
            print("Endpoint not found")
            return {
                "error": "Endpoint not found",
                "status_code": 404,
                "response_text": response.text[:500]
            }
        else:
            print(f"HTTP {response.status_code}: {response.reason}")
            print(f"Response body: {response.text[:200]}...")
            return {
                "error": f"HTTP {response.status_code}: {response.reason}",
                "status_code": response.status_code,
                "response_text": response.text[:500]
            }
            
    except requests.exceptions.ConnectTimeout:
        print("Connection timeout")
        return {"error": "Connection timeout"}
    except requests.exceptions.ConnectionError as e:
        print(f"Connection error: {e}")
        return {"error": f"Connection error: {str(e)}"}
    except requests.exceptions.RequestException as e:
        print(f"Request error: {e}")
        return {"error": f"Request error: {str(e)}"}
    
    return None


def show_network_info():
    """Show network configuration for debugging."""
    print("\n" + "="*50)
    print("NETWORK INFORMATION")
    print("="*50)
    
    try:
        # Show IP configuration
        result = subprocess.run(['ip', 'addr'], capture_output=True, text=True)
        if result.returncode == 0:
            print("IP Addresses:")
            for line in result.stdout.split('\n'):
                if 'inet ' in line:
                    print(f"  {line.strip()}")
        
        # Show routing table
        print("\nRouting table:")
        result = subprocess.run(['ip', 'route'], capture_output=True, text=True)
        if result.returncode == 0:
            for line in result.stdout.split('\n')[:5]:  # Show first 5 routes
                if line.strip():
                    print(f"  {line.strip()}")
                    
    except Exception as e:
        print(f"Error showing network info: {e}")
    
    print("="*50)


def main():
    """Main function."""
    # Configuration from environment variables
    target_ip = os.getenv('TARGET_IP', '10.16.49.164')
    username = os.getenv('VPN_USERNAME', 'user')
    password = os.getenv('VPN_PASSWORD', 'myplant')
    cmd = os.getenv('AJAX_CMD', '21')
    prm1 = os.getenv('AJAX_PRM1', '0')

    print("Dockerized VPN AJAX Client")
    print("="*50)
    print(f"Target IP: {target_ip}")
    print(f"Parameters: cmd={cmd}, prm1={prm1}")
    print(f"Username: {username}")
    print("="*50)

    # Show network configuration
    show_network_info()

    # Wait for VPN connection
    if not wait_for_vpn_connection():
        print("Failed to establish VPN connection")
        return 1

    # Make the AJAX POST request to /ajax endpoint
    print(f"\nMaking AJAX POST request to {target_ip}/ajax...")
    result = make_single_ajax_request(f"http://{target_ip}/ajax", username, password, cmd, prm1)

    if result:

        # Save to file for persistence in the mounted output directory
        timestamp = int(datetime.now().timestamp()*1000)
        os.makedirs('/collect_data/tracker', exist_ok=True)
        with open(f'/collect_data/tracker/{timestamp}.json', 'w') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"Response saved to /collect_data/tracker/{timestamp}.json")

        return 0
    else:
        print("\nFailed to get a valid response from the server.")
        return 1


if __name__ == "__main__":
    logger.info("Tracker Control loop started")
    while True:
        try:
            main()
            logger.info("Tracker Control loop finished")
            time.sleep(120)
        except Exception as e:
            logger.error(e)
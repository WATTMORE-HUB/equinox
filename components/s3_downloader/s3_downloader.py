import os
import logging
import requests
from sys import stdout


# build logger
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)
logFormatter = logging.Formatter("%(name)-12s %(asctime)s %(levelname)-8s %(filename)s:%(funcName)s %(message)s")
consoleHandler = logging.StreamHandler(stdout)
consoleHandler.setFormatter(logFormatter)
logger.addHandler(consoleHandler)

def download_files():
    try:
        # Use 'stream=True' for large files to download in chunks
        with requests.get(os.getenv("FILE_TO_DOWNLOAD"), stream=True, allow_redirects=True) as r:
            r.raise_for_status() # Raise an exception for bad status codes (4xx or 5xx)
            with open(f"/collect_data/{os.getenv('DOWNLOADED_FILENAME')}", 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192): # Iterate over chunks
                    f.write(chunk)
        logger.info(f"Downloaded {os.getenv('DOWNLOADED_FILENAME')} successfully.")
    except requests.exceptions.RequestException as e:
        logger.error(e)

if __name__ == "__main__":
    download_files()

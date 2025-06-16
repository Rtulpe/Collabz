# Real-Time Collaborative Text Editor – Python Server

## 1. Introduction
This is the Python (aiohttp) server for the Collabz editor. It participates in leader election, state sync, and serves clients via WebSocket and HTTP.
It was developed to parallel the JavaScript server, capable of cross-interaction (Python and JS servers can work together). The server was made to be client-agnostic, as long as same message formats are used.

## 2. Requirements
- Python 3.8+
- Virtual environment (venv) recommended
- Install dependencies from `requirements.txt`

## 3. How to Run & Configure
1. Create and activate a virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Configure `server_config.json` with a unique `id`, correct `port`, and all peer servers.
4. Start the server:
   ```bash
   python server.py
   ```
5. Ensure all servers in the cluster have unique IDs and correct peer lists for robust leader election.

# Real-Time Collaborative Text Editor – JS Server

## 1. Introduction
This is the Node.js (JavaScript) server for the Collabz editor. It participates in leader election, state sync, and serves clients via WebSocket and HTTP.
It was developed to parallel the Python server, capable of cross-interaction (Python and JS servers can work together). The server was made to be client-agnostic, as long as same message formats are used.

## 2. Requirements
- Node.js (see `.nvmrc` for recommended version)
- npm

## 3. How to Run & Configure
1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure `server_config.json` with a unique `id`, correct `port`, and all peer servers.
3. Start the server (LAN-accessible):
   ```bash
   node server.js
   ```
   The server checks for existing leader, if none is found, it will start a new leader election.
4. Ensure all servers in the cluster have unique IDs and correct peer lists for robust leader election.

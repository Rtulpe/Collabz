# Real-Time Collaborative Text Editor – JS Server

## 1. Introduction
This is the Node.js (JavaScript) server for the Collabz editor. It participates in leader election, state sync, and serves clients via WebSocket and HTTP.

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
   The server will listen on all interfaces (`0.0.0.0`).
4. Ensure all servers in the cluster have unique IDs and correct peer lists for robust leader election.

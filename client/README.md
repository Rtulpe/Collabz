# Collabz – Client

## 1. Introduction
This is the React client for the Collabz editor. It connects to the main server, automatically handles failover, and provides a modern collaborative editing UI.

## 2. Requirements
- Node.js (see `.nvmrc` for recommended version)
- npm

## 3. How to Run & Configure
1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure `client/public/client_config.json` with your client and server IPs/ports.
3. Start the client (LAN-accessible):
   ```bash
   npm start -- --host 0.0.0.0
   ```
   or
   ```bash
   HOST=0.0.0.0 npm start
   ```
4. Access from any device on the LAN using `http://<client-ip>:3000`.

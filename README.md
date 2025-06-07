# Collabz Editor

Collabz Editor is a robust, LAN-ready real-time collaborative text editor supporting seamless multi-user editing, automatic failover, and multi-server leader election. It is designed for reliability and easy deployment across multiple machines on your local network.

## Overview
- **Multi-server architecture**: Python and Node.js servers can run on different machines, with automatic leader election and failover.
- **LAN-ready React client**: Connects to the current main server, auto-reconnects on failover, and provides a modern collaborative UI.
- **No shared files**: All state and election info is synced over the network.
- **Config-driven**: All servers and clients are configured via JSON files for easy deployment.

## Requirements
- Node.js (see `.nvmrc` for recommended version) for the client and JS server
- Python 3.8+ for the Python server
- LAN connectivity between all devices

## How to Run & Configure
1. **Configure your servers and client**
   - Each server (JS or Python) must have a unique `id`, its own port, and a list of all peer servers in its `server_config.json`.
   - The client uses `client_config.json` to list all server addresses and its own address.
2. **Start the servers**
   - See [js-server/README.md](js-server/README.md) for Node.js server setup.
   - See [py-server/README.md](py-server/README.md) for Python server setup.
3. **Start the client**
   - See [client/README.md](client/README.md) for React client setup and LAN access.

## More Information
- [Client README](client/README.md)
- [JS Server README](js-server/README.md)
- [Python Server README](py-server/README.md)

---

Collabz Editor is open source and MIT licensed. Contributions and improvements are welcome!

---

**Original inspiration and base code:**
This project is an improved and extended fork of [Haddajii's Real-time-collaborative-text-editor](https://github.com/Haddajii/Real-time-collaborative-text-editor), originally released under the MIT License.

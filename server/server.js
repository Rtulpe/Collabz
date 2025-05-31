const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const app = express();
app.use(cors());

// Run with BACKUP=true node server.js

const PORT = 5001;
const STATE_FILE = path.join(__dirname, 'server_state.json');
const MAIN_SERVER_URL = process.env.MAIN_SERVER_URL || 'http://<PYTHON_SERVER_IP>:5001'; // Set your main server IP here
const BACKUP_PORT = 5002; // JS backup server listens here

let document = ""; // Store the document content
let cursor_positions = {}; // Store cursor positions
let isActive = false; // Whether this server is currently active (serving clients)

function saveState() {
    const state = {
        document,
        cursor_positions
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
}

function loadState() {
    if (fs.existsSync(STATE_FILE)) {
        const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
        document = state.document || "";
        cursor_positions = state.cursor_positions || {};
    }
}

async function fetchMainServerState() {
    try {
        const res = await axios.get(`${MAIN_SERVER_URL}/state`);
        if (res.data) {
            document = res.data.document || "";
            cursor_positions = res.data.cursor_positions || {};
            saveState();
        }
        return true;
    } catch (e) {
        return false;
    }
}

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    const clientId = uuidv4();
    cursor_positions[clientId] = 0;
    console.log('new client connected');

    // Send the current version of the document and client id to the newly connected client
    ws.send(JSON.stringify({ type: 'init', data: document, clientId }));

    ws.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            if (parsedMessage.type === 'update') {
                document = parsedMessage.data;
                saveState();
                // Broadcast the update to all connected clients
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'update', data: document }));
                    }
                });
            } else if (parsedMessage.type === 'cursor') {
                const pos = parsedMessage.position;
                cursor_positions[clientId] = pos;
                saveState();
                // Broadcast cursor position to all other clients
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN && client !== ws) {
                        client.send(JSON.stringify({
                            type: 'cursor',
                            clientId: clientId,
                            position: pos
                        }));
                    }
                });
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });

    ws.on('close', () => {
        console.log('client disconnected');
        delete cursor_positions[clientId];
        saveState();
    });

    // Handle WebSocket errors
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// Add HTTP endpoint for /state (for backup to sync)
app.get('/state', (req, res) => {
    res.json({ document, cursor_positions });
});

// Health check and failover logic
async function healthCheckLoop() {
    while (true) {
        const mainAlive = await fetchMainServerState();
        if (!mainAlive && !isActive) {
            // Main server is down, start backup server
            isActive = true;
            startBackupServer();
        } else if (mainAlive && isActive) {
            // Main server is back, stop backup server
            isActive = false;
            stopBackupServer();
        }
        await new Promise(r => setTimeout(r, 2000));
    }
}

let backupServer = null;
let backupWss = null;
function startBackupServer() {
    if (backupServer) return;
    backupServer = http.createServer(app);
    backupWss = new WebSocket.Server({ server: backupServer });
    // Use the same logic as your main wss.on('connection', ...)
    backupWss.on('connection', (ws) => {
        const clientId = uuidv4();
        cursor_positions[clientId] = 0;
        ws.send(JSON.stringify({ type: 'init', data: document, clientId }));
        ws.on('message', (message) => {
            try {
                const parsedMessage = JSON.parse(message);
                if (parsedMessage.type === 'update') {
                    document = parsedMessage.data;
                    saveState();
                    backupWss.clients.forEach((client) => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({ type: 'update', data: document }));
                        }
                    });
                } else if (parsedMessage.type === 'cursor') {
                    const pos = parsedMessage.position;
                    cursor_positions[clientId] = pos;
                    saveState();
                    backupWss.clients.forEach((client) => {
                        if (client.readyState === WebSocket.OPEN && client !== ws) {
                            client.send(JSON.stringify({
                                type: 'cursor',
                                clientId: clientId,
                                position: pos
                            }));
                        }
                    });
                }
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        });
        ws.on('close', () => {
            delete cursor_positions[clientId];
            saveState();
        });
        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });
    });
    backupServer.listen(BACKUP_PORT, () => {
        console.log(`Backup server listening on port ${BACKUP_PORT}`);
    });
}

function stopBackupServer() {
    if (backupWss) {
        backupWss.close();
        backupWss = null;
    }
    if (backupServer) {
        backupServer.close();
        backupServer = null;
    }
    console.log('Backup server stopped.');
}

// Load state on startup
loadState();

// Only start the main server if this is the main (not backup) instance
if (process.env.BACKUP !== 'true') {
  server.listen(PORT, () => {
    console.log(`server listening on port ${PORT}`);
  });
}

// Only run backup logic if BACKUP=true
if (process.env.BACKUP === 'true') {
  loadState();
  healthCheckLoop();
}

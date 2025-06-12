const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');
app.use(cors({
  origin: '*', // Allow any origin
  credentials: true
}));
const { v4: uuidv4 } = require('uuid');

// --- Load config ---
const CONFIG_FILE = process.env.SERVER_CONFIG || path.join(__dirname, 'server_config.json');
const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
const SERVER_ID = config.id;
const PORT = config.port;
const PEERS = config.peers; // [{id, host, port}]

// Dynamically build allowed origins from client_config.json
let allowedOrigins = ['http://localhost:3000'];
try {
    const clientConfigPath = path.join(__dirname, '../client/public/client_config.json');
    const clientConfig = JSON.parse(fs.readFileSync(clientConfigPath, 'utf-8'));
    if (clientConfig.client) {
        allowedOrigins.push(`http://${clientConfig.client.host}:${clientConfig.client.port}`);
    }
} catch (e) {
    // fallback: just localhost
}

const app = express();
app.use(cors({ origin: allowedOrigins }));

const UPTIME = Date.now() / 1000;
let STATE = { document: '', cursors: {} };
let ROLE = 'unknown'; // 'main' or 'backup'
let MAIN_ID = null;
let MAIN_ADDR = null;
let CLIENTS = new Set();

// --- Election and State Sync ---
async function getPeerUptime(peer) {
    try {
        const url = `http://${peer.host}:${peer.port}/uptime`;
        const res = await axios.get(url, { timeout: 1000 });
        return { id: res.data.id, uptime: res.data.uptime };
    } catch {
        return null;
    }
}

async function electLeader() {
    const myUptime = Date.now() / 1000 - UPTIME;
    let uptimes = [{ id: SERVER_ID, uptime: myUptime }];
    for (const peer of PEERS) {
        const peerInfo = await getPeerUptime(peer);
        if (peerInfo) uptimes.push(peerInfo);
    }
    uptimes.sort((a, b) => b.uptime - a.uptime);
    const leader = uptimes[0].id;
    let prevRole = ROLE;
    let prevMain = MAIN_ID;
    if (leader === SERVER_ID) {
        ROLE = 'main';
        MAIN_ID = SERVER_ID;
        MAIN_ADDR = `localhost:${PORT}`;
    } else {
        ROLE = 'backup';
        MAIN_ID = leader;
        for (const peer of PEERS) {
            if (peer.id === leader) {
                MAIN_ADDR = `${peer.host}:${peer.port}`;
                break;
            }
        }
    }
    if (ROLE !== prevRole || MAIN_ID !== prevMain) {
        console.log(`[Election] Role: ${ROLE}, Main: ${MAIN_ID} @ ${MAIN_ADDR}`);
    }
}

async function periodicElection() {
    while (true) {
        await electLeader();
        await new Promise(r => setTimeout(r, 2000));
    }
}

// --- HTTP API ---
app.get('/uptime', (req, res) => {
    res.json({ id: SERVER_ID, uptime: Date.now() / 1000 - UPTIME });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', role: ROLE, main: MAIN_ID });
});

app.get('/state', (req, res) => {
    res.json(STATE);
});

app.get('/election', async (req, res) => {
    await electLeader();
    res.json({ role: ROLE, main: MAIN_ID });
});

// --- WebSocket for clients and backups ---
function wsHandler(ws) {
    const clientId = uuidv4();
    CLIENTS.add(ws);
    ws.send(JSON.stringify({ type: 'init', data: STATE.document, clientId }));
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'update') {
                STATE.document = data.data;
                for (const c of CLIENTS) {
                    if (c !== ws && c.readyState === WebSocket.OPEN) {
                        c.send(JSON.stringify({ type: 'update', data: STATE.document }));
                    }
                }
            } else if (data.type === 'cursor') {
                // Only broadcast if the position actually changed for this clientId
                const prev = STATE.cursors[data.clientId];
                if (!prev || prev.position !== data.position) {
                    STATE.cursors[data.clientId] = { position: data.position, lastActive: Date.now() / 1000 };
                    for (const c of CLIENTS) {
                        if (c !== ws && c.readyState === WebSocket.OPEN) {
                            try {
                                c.send(JSON.stringify({ type: 'cursor', clientId: data.clientId, position: data.position }));
                            } catch (e) {
                                // Ignore errors for closing transports
                            }
                        }
                    }
                }
            }
        } catch (e) {
            // Ignore parse errors
        }
    });
    ws.on('close', () => {
        CLIENTS.delete(ws);
        delete STATE.cursors[clientId]; // Remove cursor state for disconnected client
    });
    ws.on('error', (e) => {
        CLIENTS.delete(ws);
    });
}

// --- Backup: poll main for state ---
async function backupStateSync() {
    while (true) {
        if (ROLE === 'backup' && MAIN_ADDR) {
            try {
                const url = `http://${MAIN_ADDR}/state`;
                const res = await axios.get(url, { timeout: 1000 });
                STATE = res.data;
            } catch {}
        }
        await new Promise(r => setTimeout(r, 1000));
    }
}

// --- Main ---
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
wss.on('connection', wsHandler);

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] ${SERVER_ID} running on port ${PORT}`);
});

periodicElection();
backupStateSync();

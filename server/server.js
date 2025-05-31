const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 5001;
let document = ""; // Store the document content
let cursor_positions = {}; // Store cursor positions

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
                // Broadcast the update to all connected clients
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'update', data: document }));
                    }
                });
            } else if (parsedMessage.type === 'cursor') {
                const pos = parsedMessage.position;
                cursor_positions[clientId] = pos;
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
    });

    // Handle WebSocket errors
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

server.listen(PORT, () => {
    console.log(`server listening on port ${PORT}`);
});

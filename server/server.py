import asyncio
import websockets
import json
import uuid
import os

PORT = 5001
DOCUMENT = ""  # Store the document content
clients = set()
cursor_positions = {}  # Track cursor positions by client id
STATE_FILE = "server_state.json"

async def save_state():
    state = {
        "document": DOCUMENT,
        "cursor_positions": cursor_positions
    }
    with open(STATE_FILE, "w") as f:
        json.dump(state, f)

async def load_state():
    global DOCUMENT, cursor_positions
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, "r") as f:
            state = json.load(f)
            DOCUMENT = state.get("document", "")
            cursor_positions.clear()
            cursor_positions.update(state.get("cursor_positions", {}))

async def handler(ws , _):
    global DOCUMENT
    client_id = str(uuid.uuid4())
    clients.add(ws)
    cursor_positions[client_id] = 0
    print("new client connected")

    # Send the current version of the document and client id to the newly connected client
    await ws.send(json.dumps({"type": "init", "data": DOCUMENT, "clientId": client_id}))

    try:
        async for message in ws:
            try:
                parsed_message = json.loads(message)
                if parsed_message.get("type") == "update":
                    DOCUMENT = parsed_message.get("data", "")
                    await save_state()
                    # Broadcast the update to all connected clients
                    for client in clients:
                        if client.open:
                            await client.send(json.dumps({"type": "update", "data": DOCUMENT}))
                elif parsed_message.get("type") == "cursor":
                    pos = parsed_message.get("position", 0)
                    cursor_positions[client_id] = pos
                    await save_state()
                    # Broadcast cursor position to all other clients
                    for client in clients:
                        if client.open and client != ws:
                            await client.send(json.dumps({"type": "cursor", "clientId": client_id, "position": pos}))
            except Exception as e:
                print("Error parsing message:", e)
    except websockets.exceptions.ConnectionClosed:
        print("client disconnected")
    finally:
        clients.remove(ws)
        cursor_positions.pop(client_id, None)
        await save_state()

async def main():
    await load_state()
    async with websockets.serve(handler, "0.0.0.0", PORT):
        print(f"server listening on port {PORT}")
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())

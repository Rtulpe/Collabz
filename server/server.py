import asyncio
import websockets
import json
import uuid

PORT = 5001
document = ""  # Store the document content
clients = set()
cursor_positions = {}  # Track cursor positions by client id

async def handler(ws, path):
    global document
    client_id = str(uuid.uuid4())
    clients.add(ws)
    cursor_positions[client_id] = 0
    print("new client connected")

    # Send the current version of the document and client id to the newly connected client
    await ws.send(json.dumps({"type": "init", "data": document, "clientId": client_id}))

    try:
        async for message in ws:
            try:
                parsed_message = json.loads(message)
                if parsed_message.get("type") == "update":
                    document = parsed_message.get("data", "")
                    # Broadcast the update to all connected clients
                    for client in clients:
                        if client.open:
                            await client.send(json.dumps({"type": "update", "data": document}))
                elif parsed_message.get("type") == "cursor":
                    pos = parsed_message.get("position", 0)
                    cursor_positions[client_id] = pos
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

async def main():
    async with websockets.serve(handler, "0.0.0.0", PORT):
        print(f"server listening on port {PORT}")
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())

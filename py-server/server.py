import asyncio
import websockets
import json
import time
import threading
from aiohttp import web, ClientSession
import os
from aiohttp.web import middleware

# Load config
CONFIG_FILE = os.environ.get('SERVER_CONFIG', 'server_config.json')
with open(CONFIG_FILE) as f:
    config = json.load(f)

SERVER_ID = config['id']
PORT = config['port']
PEERS = config['peers']  # List of {"id":..., "host":..., "port":...}

UPTIME = time.time()
STATE = {'document': '', 'cursors': {}}  # Shared state
ROLE = 'unknown'  # 'main' or 'backup'
MAIN_ID = None
MAIN_ADDR = None
CLIENTS = set()

# Allow any origin
allowed_origins = ['*']

@middleware
async def cors_middleware(request, handler):
    response = await handler(request)
    origin = request.headers.get('Origin')
    # Allow any origin
    response.headers['Access-Control-Allow-Origin'] = origin if origin else '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = '*'
    return response

# --- Election and State Sync ---
async def get_peer_uptime(peer):
    url = f"http://{peer['host']}:{peer['port']}/uptime"
    try:
        async with ClientSession() as session:
            async with session.get(url, timeout=1) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return data['id'], data['uptime']
    except Exception:
        pass
    return None, None

async def elect_leader():
    global ROLE, MAIN_ID, MAIN_ADDR
    my_uptime = time.time() - UPTIME
    uptimes = [(SERVER_ID, my_uptime)]
    for peer in PEERS:
        pid, puptime = await get_peer_uptime(peer)
        if pid and puptime is not None:
            uptimes.append((pid, puptime))
    uptimes.sort(key=lambda x: -x[1])  # Descending by uptime
    leader_id = uptimes[0][0]
    prev_role = ROLE
    prev_main = MAIN_ID
    if leader_id == SERVER_ID:
        ROLE = 'main'
        MAIN_ID = SERVER_ID
        MAIN_ADDR = f"localhost:{PORT}"
    else:
        ROLE = 'backup'
        MAIN_ID = leader_id
        for peer in PEERS:
            if peer['id'] == leader_id:
                MAIN_ADDR = f"{peer['host']}:{peer['port']}"
                break
    if ROLE != prev_role or MAIN_ID != prev_main:
        print(f"[Election] Role: {ROLE}, Main: {MAIN_ID} @ {MAIN_ADDR}")

async def periodic_election():
    while True:
        await elect_leader()
        await asyncio.sleep(2)

# --- HTTP API ---
async def handle_uptime(request):
    return web.json_response({'id': SERVER_ID, 'uptime': time.time() - UPTIME})

async def handle_health(request):
    return web.json_response({'status': 'ok', 'role': ROLE, 'main': MAIN_ID})

async def handle_state(request):
    return web.json_response(STATE)

async def handle_election(request):
    await elect_leader()
    return web.json_response({'role': ROLE, 'main': MAIN_ID})

# --- WebSocket for clients and backups ---
async def ws_handler(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    client_id = f"{SERVER_ID}-{int(time.time()*1000)%10000}"
    CLIENTS.add(ws)
    try:
        await ws.send_json({'type': 'init', 'data': STATE['document'], 'clientId': client_id})
        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                try:
                    print(f"[WS DEBUG] Received message: {msg.data}")
                    data = json.loads(msg.data)
                    if data['type'] == 'update':
                        STATE['document'] = data['data']
                        for c in list(CLIENTS):
                            if c != ws:
                                try:
                                    await c.send_json({'type': 'update', 'data': STATE['document']})
                                except Exception as e:
                                    print(f"[WS DEBUG] Error sending update to client: {e}")
                    elif data['type'] == 'cursor':
                        # Only broadcast if the position actually changed for this clientId
                        prev = STATE['cursors'].get(data['clientId'])
                        if not prev or prev['position'] != data['position']:
                            STATE['cursors'][data['clientId']] = {'position': data['position'], 'lastActive': time.time()}
                            for c in list(CLIENTS):
                                if c != ws:
                                    try:
                                        await c.send_json({'type': 'cursor', 'clientId': data['clientId'], 'position': data['position']})
                                    except Exception as e:
                                        print(f"[WS DEBUG] Error sending cursor to client: {e}")
                except Exception as e:
                    print('WS error:', e)
            elif msg.type == web.WSMsgType.ERROR:
                print('ws connection closed with exception', ws.exception())
    finally:
        CLIENTS.discard(ws)
        # Remove cursor state for disconnected client
        for cid, cursor in list(STATE['cursors'].items()):
            if cid.startswith(f"{SERVER_ID}-") and cid == client_id:
                del STATE['cursors'][cid]
    return ws

# --- Backup: poll main for state ---
async def backup_state_sync():
    global STATE
    last_main = None
    while True:
        # Always sync if not main
        if ROLE != 'main' and MAIN_ADDR:
            if MAIN_ADDR != last_main:
                # On main change, force immediate fetch
                last_main = MAIN_ADDR
            try:
                url = f"http://{MAIN_ADDR}/state"
                async with ClientSession() as session:
                    async with session.get(url, timeout=2) as resp:
                        if resp.status == 200:
                            new_state = await resp.json()
                            STATE = new_state
            except Exception:
                pass
        await asyncio.sleep(1)

# --- Main ---
async def main():
    app = web.Application(middlewares=[cors_middleware])
    app.router.add_get('/uptime', handle_uptime)
    app.router.add_get('/health', handle_health)
    app.router.add_get('/state', handle_state)
    app.router.add_get('/election', handle_election)
    app.router.add_get('/ws', ws_handler)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', PORT)
    await site.start()
    print(f"[Server] {SERVER_ID} running on port {PORT}")
    await asyncio.gather(periodic_election(), backup_state_sync())

if __name__ == '__main__':
    asyncio.run(main())

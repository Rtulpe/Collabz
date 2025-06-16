import { useEffect } from 'react';

export default function useWebSocket(
  setSocket,
  setDocument,
  setClientId,
  setCursors,
  editorRef,
  socketRef,
  clientIdRef,
  suppressNextUpdateRef,
  lastSentDocRef
) {
  useEffect(() => {
    let ws;
    let reconnectTimeout = null;
    let isUnmounted = false;
    let servers = [];
    let failedServers = {};
    const COOLDOWN = 10000;

    async function fetchConfig() {
      const res = await fetch('/client_config.json');
      const cfg = await res.json();
      servers = cfg.servers || [];
    }

    async function findMainServer() {
      const now = Date.now();
      for (const s of servers) {
        const key = s.host + ':' + s.port;
        if (failedServers[key] && now - failedServers[key] < COOLDOWN) {
          continue;
        }
        try {
          const url = `http://${s.host}:${s.port}/health`;
          const res = await fetch(url, { timeout: 1000 });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          if (data.role === 'main') {
            return s;
          }
        } catch (err) {
          failedServers[key] = Date.now();
        }
      }
      return null;
    }

    function connectToServer(server) {
      if (!server) return;
      const wsUrl = `ws://${server.host}:${server.port}/ws`;
      ws = new window.WebSocket(wsUrl);
      ws.onopen = () => {
        setSocket(ws);
        socketRef.current = ws;
        console.log('websocket connection established:', wsUrl);
      };
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'init') {
            setDocument(message.data);
            lastSentDocRef.current = message.data;
            if (message.clientId) setClientId(message.clientId);
            if (editorRef.current && editorRef.current.getModel()) {
              suppressNextUpdateRef.current = true;
              editorRef.current.setValue(message.data);
            }
          } else if (message.type === 'update') {
            setDocument(message.data);
            lastSentDocRef.current = message.data;
            if (editorRef.current && editorRef.current.getModel() && editorRef.current.getValue() !== message.data) {
              const editor = editorRef.current;
              const selection = editor.getSelection();
              suppressNextUpdateRef.current = true;
              editor.setValue(message.data);
              if (selection) editor.setSelection(selection);
            }
          } else if (message.type === 'cursor') {
            if (message.clientId !== clientIdRef.current) {
              setCursors(prev => ({
                ...prev,
                [message.clientId]: { position: message.position, lastActive: Date.now() }
              }));
            }
          }
        } catch (error) {}
      };
      ws.onclose = () => {
        if (isUnmounted) return;
        failedServers[server.host + ':' + server.port] = Date.now();
        attemptReconnect();
      };
      ws.onerror = (error) => {
        if (isUnmounted) return;
        ws.close();
      };
    }

    async function attemptReconnect() {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      reconnectTimeout = setTimeout(async () => {
        const main = await findMainServer();
        if (main) {
          connectToServer(main);
        } else {
          attemptReconnect();
        }
      }, 2000);
    }

    (async () => {
      await fetchConfig();
      const main = await findMainServer();
      if (main) {
        connectToServer(main);
      } else {
        attemptReconnect();
      }
    })();

    return () => {
      isUnmounted = true;
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [setSocket, setDocument, setClientId, setCursors, editorRef, socketRef, clientIdRef, suppressNextUpdateRef, lastSentDocRef]);
}

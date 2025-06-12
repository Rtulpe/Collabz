import { useRef, useState, useEffect, useCallback } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import './App.css';

function App() {
  const [document, setDocument] = useState("");
  const [socket, setSocket] = useState(null);
  const [clientId, setClientId] = useState(null);
  const [cursors, setCursors] = useState({}); // { clientId: { position, lastActive } }
  const [clientAddr, setClientAddr] = useState(null);
  const editorRef = useRef(null);
  const monaco = useMonaco();
  const socketRef = useRef(null); // NEW
  const clientIdRef = useRef(null); // NEW

  // Used to suppress sending update when applying remote update
  const suppressNextUpdateRef = useRef(false);

  // Fetch client address from config
  useEffect(() => {
    fetch('/client_config.json')
      .then(res => res.json())
      .then(cfg => {
        if (cfg.client) {
          setClientAddr(`http://${cfg.client.host}:${cfg.client.port}`);
        }
      });
  }, []);

  // Clean up inactive cursors every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCursors(prev => {
        const now = Date.now();
        const filtered = {};
        Object.entries(prev).forEach(([id, data]) => {
          // Only keep cursors active in the last 5 seconds
          if (now - data.lastActive < 5000) filtered[id] = data;
        });
        return filtered;
      });
      // Remove decorations for any cursors that are no longer present
      if (editorRef.current && editorRef.current.getModel()) {
        const editor = editorRef.current;
        const model = editor.getModel();
        // Remove all remote cursor decorations if no remote cursors remain
        if (editor._remoteCursorDecorations) {
          // Remove all decorations if no filtered remote cursors remain
          if (Object.keys(cursors).length === 0) {
            editor._remoteCursorDecorations = editor.deltaDecorations(
              editor._remoteCursorDecorations,
              []
            );
          }
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []); // Remove [cursors] dependency so cleanup is based on time, not new messages

  // WebSocket logic (unchanged except for Monaco integration)
  useEffect(() => {
    let ws;
    let reconnectTimeout = null;
    let isUnmounted = false;
    let servers = [];
    let failedServers = {};
    const COOLDOWN = 10000; // 10 seconds

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
          // Only warn, do not throw
          if (!failedServers[key]) {
            // Only log once per cooldown
            // console.warn(`Server unreachable: ${key}`, err);
          }
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
        socketRef.current = ws; // Always keep ref up to date
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
              // DO NOT broadcast local cursor after init (prevents infinite loop)
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
              // DO NOT broadcast local cursor after update (prevents infinite loop)
            }
          }
          else if (message.type === 'cursor') {
            if (message.clientId !== clientIdRef.current) {
              setCursors(prev => ({
                ...prev,
                [message.clientId]: { position: message.position, lastActive: Date.now() }
              }));
            }
          }
        } catch (error) {
          // Ignore parse errors
        }
      };
      ws.onclose = () => {
        if (isUnmounted) return;
        // console.log('websocket connection closed:', wsUrl);
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
  }, []);

  // Handle local edits
  const lastSentDocRef = useRef("");
  const handleEditorChange = (value, event) => {
    if (suppressNextUpdateRef.current) {
      suppressNextUpdateRef.current = false;
      setDocument(value);
      lastSentDocRef.current = value;
      return;
    }
    if (value !== lastSentDocRef.current) {
      setDocument(value);
      lastSentDocRef.current = value;
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'update', data: value }));
      }
    }
  };

  // Keep clientIdRef up to date
  useEffect(() => {
    clientIdRef.current = clientId;
  }, [clientId]);

  // Handle local cursor movement (only send if changed, and only for our own cursor)
  const lastSentCursorPosRef = useRef(null);
  const handleEditorCursor = useCallback((editor, monaco) => {
    const socket = socketRef.current;
    const clientId = clientIdRef.current;
    if (socket && socket.readyState === WebSocket.OPEN && clientId) {
      const pos = editor.getPosition();
      const offset = editor.getModel().getOffsetAt(pos);
      if (lastSentCursorPosRef.current !== offset) {
        lastSentCursorPosRef.current = offset;
        socket.send(JSON.stringify({ type: 'cursor', position: offset, clientId }));
      }
    }
  }, []);

  // Render remote cursors
  useEffect(() => {
    if (!editorRef.current || !monaco || !editorRef.current.getModel()) return;
    const editor = editorRef.current;
    // Defensive: skip if no model
    const model = editor.getModel();
    if (!model) return;
    // Remove old decorations
    editor._remoteCursorDecorations = editor.deltaDecorations(
      editor._remoteCursorDecorations || [],
      []
    );
    // Add new decorations for all remote cursors
    const decorations = Object.entries(cursors)
      .filter(([id]) => id !== clientId && cursors[id] && typeof cursors[id].position === 'number')
      .map(([id, data]) => {
        // Defensive: clamp position to model length
        let pos = 0;
        try {
          pos = Math.max(0, Math.min(data.position, model.getValueLength()));
        } catch (e) { pos = 0; }
        const monacoPos = model.getPositionAt(pos);
        return {
          range: new monaco.Range(monacoPos.lineNumber, monacoPos.column, monacoPos.lineNumber, monacoPos.column),
          options: {
            className: 'remote-cursor',
            hoverMessage: { value: `User: ${id}` },
            // Only render a thin cursor, no label or after content
            isWholeLine: false,
            stickiness: monaco && monaco.editor ? monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges : 0,
          },
        };
      });
    editor._remoteCursorDecorations = editor.deltaDecorations(
      editor._remoteCursorDecorations || [],
      decorations
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursors, clientId, document, monaco]);

  // Editor mount
  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    // Send cursor on position change
    editor.onDidChangeCursorPosition(() => handleEditorCursor(editor, monaco));
    // Also send cursor on selection change (covers mouse, keyboard, etc)
    editor.onDidChangeCursorSelection(() => handleEditorCursor(editor, monaco));
    // Optionally, send cursor on focus (in case of missed events)
    editor.onDidFocusEditorWidget(() => handleEditorCursor(editor, monaco));
    // Immediately broadcast local cursor on mount
    handleEditorCursor(editor, monaco);
  };

  // Debug log for clientId
  useEffect(() => {
    if (clientId) {
      console.log('My clientId:', clientId);
    }
  }, [clientId]);

  return (
    <div className='App' style={{ position: 'relative' }}>
      <h1>Tulpe Lens</h1>
      {clientAddr && (
        <div className="client-address">
          <b>Client address:</b> <span>{clientAddr}</span>
        </div>
      )}
      <div style={{ position: 'relative', display: 'inline-block', width: '800px', height: '500px' }}>
        <Editor
          height="500px"
          width="800px"
          defaultLanguage="plaintext"
          value={document}
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: false },
            fontSize: 16,
            fontFamily: 'monospace',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            lineNumbers: 'on',
            renderLineHighlight: 'none',
            cursorSmoothCaretAnimation: true,
          }}
        />
      </div>
    </div>
  );
}
export default App;
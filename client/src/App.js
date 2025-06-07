import React , {useState , useEffect , useLayoutEffect} from 'react' ;
import './App.css' ; 

function App(){
  const [document , setDocument] = useState("") ; 
  const [socket,setSocket] = useState(null) ; 
  const [clientId, setClientId] = useState(null);
  const [cursors, setCursors] = useState({}); // { clientId: { position, lastActive } }
  const [cursorCoords, setCursorCoords] = useState({}); // { clientId: {top, left} }
  const [clientAddr, setClientAddr] = useState(null); // <-- NEW
  const textareaRef = React.useRef(null);
  const mirrorRef = React.useRef(null);

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
          if (now - data.lastActive < 30000) filtered[id] = data;
        });
        return filtered;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let ws;
    let reconnectTimeout = null;
    let isUnmounted = false;
    let servers = [];
    let failedServers = {};
    const COOLDOWN = 10000; // 10 seconds
    // eslint-disable-next-line
    let currentMain = null;

    async function fetchConfig() {
      const res = await fetch('/client_config.json');
      const cfg = await res.json();
      servers = cfg.servers || [];
    }

    async function findMainServer() {
      const now = Date.now();
      for (const s of servers) {
        const key = s.host + ':' + s.port;
        // Skip servers that failed recently
        if (failedServers[key] && now - failedServers[key] < COOLDOWN) {
          continue;
        }
        try {
          const url = `http://${s.host}:${s.port}/health`;
          const res = await fetch(url, { timeout: 1000 });
          const data = await res.json();
          if (data.role === 'main') {
            return s;
          }
        } catch {
          if (!failedServers[key]) {
            console.warn(`Server unreachable: ${key}`);
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
        currentMain = server;
        console.log('websocket connection established:', wsUrl);
      };
      ws.onmessage = (event) => {
        try{
          const message = JSON.parse(event.data);
          if(message.type === 'init'){
            setDocument(message.data);
            if (message.clientId) setClientId(message.clientId);
          }else if(message.type === 'update'){
            setDocument(message.data);
          }else if(message.type === 'cursor'){
            setCursors(prev => ({
              ...prev,
              [message.clientId]: { position: message.position, lastActive: Date.now() }
            }));
          }
        } catch(error){
          console.error('error parsing message', error);
        }
      };
      ws.onclose = () => {
        if (isUnmounted) return;
        console.log('websocket connection closed:', wsUrl);
        failedServers[server.host + ':' + server.port] = Date.now();
        attemptReconnect();
      };
      ws.onerror = (error) => {
        if (isUnmounted) return;
        console.error('websocket error:', error);
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
          // Try again in 2s
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
  },[]) ;

  const handleChange = (e) => {
    const newDocument = e.target.value ; 
    setDocument(newDocument) ;
    if(socket && socket.readyState === WebSocket.OPEN){
      socket.send(JSON.stringify({type: 'update' , data: newDocument}))  ;
    }
  };

  const handleCursor = (e) => {
    const pos = e.target.selectionStart;
    if(socket && socket.readyState === WebSocket.OPEN && clientId){
      socket.send(JSON.stringify({type: 'cursor', position: pos, clientId}));
    }
  };

  // Helper to copy computed styles from textarea to mirror
  const copyTextareaStyles = () => {
    const textarea = textareaRef.current;
    const mirror = mirrorRef.current;
    if (!textarea || !mirror) return;
    const style = window.getComputedStyle(textarea);
    mirror.style.fontFamily = style.fontFamily;
    mirror.style.fontSize = style.fontSize;
    mirror.style.fontWeight = style.fontWeight;
    mirror.style.letterSpacing = style.letterSpacing;
    mirror.style.padding = style.padding;
    mirror.style.border = style.border;
    mirror.style.boxSizing = style.boxSizing;
    mirror.style.lineHeight = style.lineHeight;
    mirror.style.textAlign = style.textAlign;
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.wordWrap = 'break-word';
    mirror.style.overflowWrap = 'break-word';
    mirror.style.width = style.width;
    mirror.style.height = style.height;
    mirror.style.minHeight = style.minHeight;
    mirror.style.maxHeight = style.maxHeight;
    mirror.style.background = 'transparent';
    mirror.style.visibility = 'hidden';
    mirror.style.position = 'absolute';
    mirror.style.top = '0';
    mirror.style.left = '0';
    mirror.style.pointerEvents = 'none';
    mirror.style.zIndex = '0';
  };

  // Update mirror content and measure cursor positions after render
  useLayoutEffect(() => {
    if (!textareaRef.current || !mirrorRef.current) return;
    const textarea = textareaRef.current;
    const mirror = mirrorRef.current;
    copyTextareaStyles();
    mirror.scrollTop = textarea.scrollTop;
    mirror.scrollLeft = textarea.scrollLeft;
    const newCoords = {};
    Object.entries(cursors).forEach(([id, data]) => {
      if (id === clientId) return;
      const pos = data.position;
      const text = document;
      const before = text.slice(0, pos);
      const after = text.slice(pos);
      const htmlBefore = before.replace(/\n/g, '<br/>').replace(/ /g, '&nbsp;');
      const htmlAfter = after.replace(/\n/g, '<br/>').replace(/ /g, '&nbsp;');
      mirror.innerHTML = `${htmlBefore}<span id='caret-marker'></span>${htmlAfter}`;
      const marker = mirror.querySelector('#caret-marker');
      if (marker) {
        const rect = marker.getBoundingClientRect();
        const mirrorRect = mirror.getBoundingClientRect();
        // Offset by textarea scroll
        newCoords[id] = {
          top: rect.top - mirrorRect.top - textarea.scrollTop,
          left: rect.left - mirrorRect.left - textarea.scrollLeft
        };
      }
    });
    setCursorCoords(newCoords);
    // Clean up
    mirror.innerHTML = '';
  }, [cursors, document, clientId]);

  // Helper to render other clients' cursors as floating bubbles in the textarea
  const renderCursors = () => {
    return Object.entries(cursors)
      .filter(([id]) => id !== clientId)
      .map(([id], idx) => {
        const coords = cursorCoords[id] || { top: 0, left: 0 };
        const label = id[0] ? id[0].toLowerCase() : '?';
        let charWidth = 9;
        if (textareaRef.current) {
          const style = window.getComputedStyle(textareaRef.current);
          charWidth = parseFloat(style.fontSize) * 0.6;
        }
        return (
          <div
            key={id}
            className="remote-cursor-container"
            style={{
              top: coords.top,
              left: coords.left + charWidth * 2,
            }}
          >
            <div className="remote-cursor-label">{label}</div>
            <div className="remote-cursor-caret">I</div>
          </div>
        );
      });
  };

  return (
    <div className='App' style={{ position: 'relative' }}>
      <h1>Tulpe Lens</h1>
      {clientAddr && (
        <div className="client-address">
          <b>Client address:</b> <span>{clientAddr}</span>
        </div>
      )}
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <textarea
           ref={textareaRef}
           value={document}
           onChange={handleChange}
           onSelect={handleCursor}
           onKeyUp={handleCursor}
           rows="20"
           cols = "80"
           style={{ position: 'relative', zIndex: 1 }}
         />
        {/* Hidden mirror div for accurate cursor positioning */}
        <div
          id="textarea-mirror"
          ref={mirrorRef}
          className="textarea-mirror"
        />
        {renderCursors()}
      </div>
    </div>
  );
}
export default App;
import React , {useState , useEffect , useLayoutEffect} from 'react' ;
import './App.css' ; 

function App(){
  const [document , setDocument] = useState("") ; 
  const [socket,setSocket] = useState(null) ; 
  const [clientId, setClientId] = useState(null);
  const [cursors, setCursors] = useState({}); // { clientId: { position, lastActive } }
  const [cursorCoords, setCursorCoords] = useState({}); // { clientId: {top, left} }
  const textareaRef = React.useRef(null);
  const mirrorRef = React.useRef(null);

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
    const newSocket = new WebSocket('ws://localhost:5001') ; 
    setSocket(newSocket) ;

    newSocket.onopen = () => {
      console.log('websocket connection established') ; 
    };

    newSocket.onmessage = (event) => {
      try{
        const message = JSON.parse(event.data) ; 
        if(message.type === 'init'){
          setDocument(message.data) ;
          if (message.clientId) setClientId(message.clientId);
        }else if(message.type === 'update'){
          setDocument(message.data)  ;
        }else if(message.type === 'cursor'){
          setCursors(prev => ({
            ...prev,
            [message.clientId]: { position: message.position, lastActive: Date.now() }
          }));
        }
      } catch(error){
        console.error('error parsing message' , error) ; 
      }
    };

    newSocket.onclose = () => {
      console.log('websocket conenction closed') ; 
    };

    newSocket.onerror = (error) => {
      console.error('websocket error:', error) ;
    };

    return () => {
      newSocket.close() ; 
    } ;
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
        // Show only the first letter of the UUID, lowercase
        const label = id[0] ? id[0].toLowerCase() : '?';
        // Calculate a better horizontal offset for the caret
        let charWidth = 9; // fallback
        if (textareaRef.current) {
          const style = window.getComputedStyle(textareaRef.current);
          charWidth = parseFloat(style.fontSize) * 0.6;
        }
        return (
          <div
            key={id}
            style={{
              position: 'absolute',
              top: coords.top,
              left: coords.left + charWidth * 4,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              pointerEvents: 'none',
              zIndex: 10,
              transform: 'translateY(-50%)',
            }}
          >
            <div
              style={{
                color: '#1976d2',
                fontWeight: 'bold',
                fontSize: '0.9em',
                background: 'white',
                borderRadius: '4px',
                border: '1px solid #1976d2',
                padding: '0 4px',
                marginBottom: '2px',
                boxShadow: '0 1px 4px #0001',
                opacity: 0.85,
                userSelect: 'none',
                position: 'relative',
                top: '-8px',
              }}
            >
              {label}
            </div>
            <div
              style={{
                color: '#d32f2f',
                fontWeight: 'bold',
                fontSize: '1.3em',
                background: 'transparent',
                userSelect: 'none',
                textShadow: '0 1px 2px #fff, 0 0 2px #d32f2f',
                lineHeight: '1',
                height: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                letterSpacing: '0',
              }}
            >
              {'I'}
            </div>
          </div>
        );
      });
  };

  return (
    <div className='App' style={{ position: 'relative' }}>
      <h1>Google Docs men jumia</h1>
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
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            visibility: 'hidden',
            pointerEvents: 'none',
            fontFamily: 'inherit',
            fontSize: 'inherit',
            padding: '8px',
            boxSizing: 'border-box',
            zIndex: 0
          }}
        />
        {renderCursors()}
      </div>
    </div>
  );
}
export default App;
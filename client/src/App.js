import { useRef, useState, useCallback } from "react";
import Editor, { useMonaco } from "@monaco-editor/react";
import "./App.css";
import useClientAddr from "./hooks/useClientAddr";
import useCleanupCursors from "./hooks/useCleanupCursors";
import useWebSocket from "./hooks/useWebSocket";
import useKeepClientIdRef from "./hooks/useKeepClientIdRef";
import useDebugClientId from "./hooks/useDebugClientId";
import useRenderRemoteCursors from "./hooks/useRenderRemoteCursors";

function App() {
  const [document, setDocument] = useState(""); // Initialize with empty document
  const [socket, setSocket] = useState(null); // WebSocket connection
  const [clientId, setClientId] = useState(null); // Unique client ID
  // Holds the mapping of remote client IDs to their cursor position and last activity time.
  // Structure:
  // {
  //   "user-123": { position: 42, lastActive: 1718550000000 },
  //   "user-456": { position: 17, lastActive: 1718550012345 }
  // }
  // - Keys: remote client IDs (string)
  // - Values: { position: <number>, lastActive: <timestamp ms> }
  const [cursors, setCursors] = useState({}); // Initialize with empty cursors object
  const [clientAddr, setClientAddr] = useState(null); // Client IP address, only for display
  const editorRef = useRef(null); // Reference to the Monaco editor instance
  const monaco = useMonaco(); // Hook for accessing the Monaco instance
  const socketRef = useRef(null); // WebSocket reference to maintain connection state
  const clientIdRef = useRef(null); // Reference to keep the latest client ID

  // Used to suppress sending update when applying remote update
  const suppressNextUpdateRef = useRef(false);

  // Fetch the client IP address
  useClientAddr(setClientAddr);

  // Clean up inactive cursors every second
  useCleanupCursors(editorRef, cursors, setCursors);

  // WebSocket logic
  const lastSentDocRef = useRef("");
  useWebSocket(
    setSocket,
    setDocument,
    setClientId,
    setCursors,
    editorRef,
    socketRef,
    clientIdRef,
    suppressNextUpdateRef,
    lastSentDocRef
  );

  // Keep clientIdRef up to date
  useKeepClientIdRef(clientId, clientIdRef);

  // Debug log for clientId
  useDebugClientId(clientId);

  // Render remote cursors
  useRenderRemoteCursors(editorRef, monaco, cursors, clientId, document);

  // Handle local edits
  const handleEditorChange = (value, _) => {
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
        socket.send(JSON.stringify({ type: "update", data: value }));
      }
    }
  };

  // Handle local cursor movement (only send if changed, and only for our own cursor)
  const lastSentCursorPosRef = useRef(null);
  const handleEditorCursor = useCallback((editor, _) => {
    const socket = socketRef.current;
    const clientId = clientIdRef.current;
    if (socket && socket.readyState === WebSocket.OPEN && clientId) {
      const pos = editor.getPosition();
      const offset = editor.getModel().getOffsetAt(pos);
      if (lastSentCursorPosRef.current !== offset) {
        lastSentCursorPosRef.current = offset;
        socket.send(
          JSON.stringify({ type: "cursor", position: offset, clientId })
        );
      }
    }
  }, []);

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

  return (
    <div className="App" style={{ position: "relative" }}>
      <h1>Tulpe Lens</h1>
      {clientAddr && (
        <div className="client-address">
          <b>Client address:</b> <span>{clientAddr}</span>
        </div>
      )}
      <div
        style={{
          position: "relative",
          display: "inline-block",
          width: "800px",
          height: "500px",
        }}
      >
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
            fontFamily: "monospace",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            lineNumbers: "on",
            renderLineHighlight: "none",
            cursorSmoothCaretAnimation: true,
          }}
        />
      </div>
    </div>
  );
}
export default App;

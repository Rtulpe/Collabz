import { useEffect } from "react";

export default function useCleanupCursors(editorRef, cursors, setCursors) {
  useEffect(() => {
    const interval = setInterval(() => {
      setCursors((prev) => {
        const now = Date.now();
        const filtered = {};
        Object.entries(prev).forEach(([id, data]) => {
          if (now - data.lastActive < 5000) filtered[id] = data;
        });
        return filtered;
      });
      if (editorRef.current && editorRef.current.getModel()) {
        const editor = editorRef.current;
        if (editor._remoteCursorDecorations) {
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
  }, [editorRef, cursors, setCursors]);
}

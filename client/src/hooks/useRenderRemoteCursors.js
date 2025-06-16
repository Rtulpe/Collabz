import { useEffect } from "react";

export default function useRenderRemoteCursors(
  editorRef,
  monaco,
  cursors,
  clientId,
  document
) {
  useEffect(() => {
    if (!editorRef.current || !monaco || !editorRef.current.getModel()) return;
    const editor = editorRef.current;
    const model = editor.getModel();
    if (!model) return;
    editor._remoteCursorDecorations = editor.deltaDecorations(
      editor._remoteCursorDecorations || [],
      []
    );
    const decorations = Object.entries(cursors)
      .filter(
        ([id]) =>
          id !== clientId &&
          cursors[id] &&
          typeof cursors[id].position === "number"
      )
      .map(([id, data]) => {
        let pos = 0;
        try {
          pos = Math.max(0, Math.min(data.position, model.getValueLength()));
        } catch (e) {
          pos = 0;
        }
        const monacoPos = model.getPositionAt(pos);
        return {
          range: new monaco.Range(
            monacoPos.lineNumber,
            monacoPos.column,
            monacoPos.lineNumber,
            monacoPos.column
          ),
          options: {
            className: "remote-cursor",
            hoverMessage: { value: `User: ${id}` },
            isWholeLine: false,
            stickiness:
              monaco && monaco.editor
                ? monaco.editor.TrackedRangeStickiness
                    .NeverGrowsWhenTypingAtEdges
                : 0,
          },
        };
      });
    editor._remoteCursorDecorations = editor.deltaDecorations(
      editor._remoteCursorDecorations || [],
      decorations
    );
  }, [editorRef, monaco, cursors, clientId, document]);
}

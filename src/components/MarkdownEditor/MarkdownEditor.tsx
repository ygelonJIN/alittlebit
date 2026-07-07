import { useRef, useCallback, useEffect } from 'react';
import { useStore } from '../../store';
import './MarkdownEditor.css';

interface Props {
  isReadOnly: boolean;
}

export default function MarkdownEditor({ isReadOnly }: Props) {
  const lines = useStore((s) => s.lines);
  const selectLine = useStore((s) => s.selectLine);
  const activeLineId = useStore((s) => s.activeLineId);
  const setEditorLines = useStore((s) => s.setEditorLines);
  const activeFileId = useStore((s) => s.activeFileId);
  const files = useStore((s) => s.files);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const activeFile = files.find((f) => f.id === activeFileId);
  const fileName = activeFile?.name ?? 'untitled';
  const activeLine = lines.find((l) => l.id === activeLineId);

  const text = lines.map((l) => l.text).join('\n');

  const syncScroll = useCallback(() => {
    if (textareaRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (isReadOnly) return;
    const newText = e.target.value;
    const newLines = newText.split('\n');
    const updatedLines = newLines.map((text, i) => ({
      id: lines[i]?.id ?? `L${i + 1}`,
      lineNumber: i + 1,
      text,
      type: lines[i]?.type as any ?? 'paragraph',
      active: lines[i]?.active ?? false,
    }));
    setEditorLines(updatedLines);
  };

  const handleClick = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const textBefore = ta.value.substring(0, pos);
    const lineIdx = textBefore.split('\n').length - 1;
    const targetLine = lines[lineIdx];
    if (targetLine) selectLine(targetLine.id);
  };

  useEffect(() => {
    syncScroll();
  });

  const lineCount = lines.length;
  const gutterNumbers = Array.from({ length: Math.max(lineCount, 1) }, (_, i) => i + 1);

  return (
    <div className="editor">
      <div className="editor-toolbar">
        <span>
          {fileName}
          {isReadOnly && <span className="readonly-badge"> READ ONLY</span>}
        </span>
        <span>Ln {activeLine?.lineNumber ?? 1}, Col 1</span>
      </div>
      <div className="editor-body">
        <div className="editor-topfade" />
        <div className="editor-view">
          <div className="editor-gutter" ref={gutterRef}>
            {gutterNumbers.map((n) => (
              <div key={n} className="gutter-line">{n}</div>
            ))}
          </div>
          <textarea
            ref={textareaRef}
            className="editor-textarea"
            value={text}
            onChange={handleChange}
            onClick={handleClick}
            onScroll={syncScroll}
            disabled={isReadOnly}
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}

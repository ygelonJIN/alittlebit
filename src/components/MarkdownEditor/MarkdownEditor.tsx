import { useRef, useCallback, useEffect, useState } from 'react';
import { useStore } from '../../store';
import './MarkdownEditor.css';

interface Props {
  isReadOnly: boolean;
  onCursorMove?: (line: number, col: number) => void;
}

function renderMd(text: string): JSX.Element[] {
  const lines = text.split('\n');
  const els: JSX.Element[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      els.push(<div key={i} className="md-blank">&nbsp;</div>);
      i++;
      continue;
    }

    if (trimmed.startsWith('### ')) {
      els.push(<h3 key={i} className="md-h3">{trimmed.slice(4)}</h3>);
      i++;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      els.push(<h2 key={i} className="md-h2">{trimmed.slice(3)}</h2>);
      i++;
      continue;
    }
    if (trimmed.startsWith('# ')) {
      els.push(<h1 key={i} className="md-h1">{trimmed.slice(2)}</h1>);
      i++;
      continue;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      els.push(<div key={i} className="md-li">• {trimmed.slice(2)}</div>);
      i++;
      continue;
    }

    // Bold
    const boldParts = trimmed.split(/(\*\*[^*]+\*\*)/g);
    const children = boldParts.map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={j}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });

    els.push(<p key={i} className="md-p">{children}</p>);
    i++;
  }

  return els;
}

export default function MarkdownEditor({ isReadOnly, onCursorMove }: Props) {
  const lines = useStore((s) => s.lines);
  const activeFileId = useStore((s) => s.activeFileId);
  const activeVersionId = useStore((s) => s.activeVersionId);
  const selectLine = useStore((s) => s.selectLine);
  const setEditorLines = useStore((s) => s.setEditorLines);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // History for undo/redo
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const isUndoRedoRef = useRef(false);

  const text = lines.map((l) => l.text).join('\n');
  
  // Initialize history when file changes
  useEffect(() => {
    historyRef.current = [text];
    historyIndexRef.current = 0;
  }, [activeFileId]);

  // Save to history when text changes (from AI or external)
  useEffect(() => {
    if (historyRef.current.length === 0) {
      historyRef.current = [text];
      historyIndexRef.current = 0;
    } else {
      const lastText = historyRef.current[historyIndexRef.current];
      if (text !== lastText && !isUndoRedoRef.current) {
        // Remove any redo history
        historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
        historyRef.current.push(text);
        historyIndexRef.current = historyRef.current.length - 1;
        // Limit history size
        if (historyRef.current.length > 100) {
          historyRef.current.shift();
          historyIndexRef.current--;
        }
      }
    }
  }, [text]);


  const syncScroll = useCallback(() => {
    if (textareaRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  // Auto-save to disk with debounce
  const saveToDisk = useCallback((linesToSave: typeof lines) => {
    if (!activeFileId || !activeVersionId) return;
    const content = linesToSave.map(l => l.text).join('\n');
    const relPath = `letsgo/versions/${activeVersionId}/${activeFileId}`;
    fetch('/api/files/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: relPath, content }),
    }).catch(err => console.warn('[auto-save] failed:', err));
  }, [activeFileId, activeVersionId]);

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
    
    // Save to history (only if not undo/redo)
    if (!isUndoRedoRef.current) {
      const history = historyRef.current;
      const idx = historyIndexRef.current;
      // Remove any redo history
      historyRef.current = history.slice(0, idx + 1);
      historyRef.current.push(newText);
      historyIndexRef.current = historyRef.current.length - 1;
      // Limit history size
      if (historyRef.current.length > 100) {
        historyRef.current.shift();
        historyIndexRef.current--;
      }
    }
    isUndoRedoRef.current = false;

    // Debounce auto-save (500ms after last keystroke)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveToDisk(updatedLines), 500);
  };

  const handleClick = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const textBefore = ta.value.substring(0, pos);
    const lineIdx = textBefore.split('\n').length - 1;
    const targetLine = lines[lineIdx];
    if (targetLine) selectLine(targetLine.id);
    const lastNewline = textBefore.lastIndexOf('\n');
    const col = pos - lastNewline;
    onCursorMove?.(lineIdx + 1, col);
  };
  
  const undo = () => {
    const idx = historyIndexRef.current;
    if (idx <= 0) return;
    historyIndexRef.current = idx - 1;
    const prevText = historyRef.current[idx - 1];
    isUndoRedoRef.current = true;
    const newLines = prevText.split('\n');
    const updatedLines = newLines.map((text, i) => ({
      id: `L${i + 1}`,
      lineNumber: i + 1,
      text,
      type: 'paragraph' as any,
      active: false,
    }));
    setEditorLines(updatedLines);
    saveToDisk(updatedLines);
  };
  
  const redo = () => {
    const idx = historyIndexRef.current;
    if (idx >= historyRef.current.length - 1) return;
    historyIndexRef.current = idx + 1;
    const nextText = historyRef.current[idx + 1];
    isUndoRedoRef.current = true;
    const newLines = nextText.split('\n');
    const updatedLines = newLines.map((text, i) => ({
      id: `L${i + 1}`,
      lineNumber: i + 1,
      text,
      type: 'paragraph' as any,
      active: false,
    }));
    setEditorLines(updatedLines);
    saveToDisk(updatedLines);
  };

  useEffect(() => {
    syncScroll();
  });

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const lineCount = lines.length;
  const gutterNumbers = Array.from({ length: Math.max(lineCount, 1) }, (_, i) => i + 1);

  const previewContent = renderMd(text);

  return (
    <div className="editor">
      <div className="editor-body">
        <div className="editor-mode-bar">
          <button className={`editor-mode-btn${mode === 'edit' ? ' active' : ''}`} onClick={() => setMode('edit')}>Edit</button>
          <button className={`editor-mode-btn${mode === 'preview' ? ' active' : ''}`} onClick={() => setMode('preview')}>Preview</button>
          <button className="editor-mode-btn editor-undo-btn" onClick={undo} title="撤销">←</button>
          <button className="editor-mode-btn editor-redo-btn" onClick={redo} title="重做">→</button>
        </div>
        {mode === 'edit' ? (
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
        ) : (
          <div className="editor-preview">{previewContent}</div>
        )}
      </div>
    </div>
  );
}

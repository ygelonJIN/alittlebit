import { useState, useRef, useEffect } from 'react';
import type { FileItem } from '../../data/files';
import { useStore } from '../../store';
import './FileExplorer.css';

interface Props {
  files: FileItem[];
}

const TYPE_PILLS: Record<string, string> = {
  md: 'green',
  tsx: 'blue',
  ts: 'blue',
  css: 'purple',
  json: 'yellow',
  html: 'red',
  js: 'yellow',
  log: 'purple',
  diff: 'red',
};

export default function FileExplorer({ files }: Props) {
  const activeFileId = useStore((s) => s.activeFileId);
  const selectFile = useStore((s) => s.selectFile);
  const createFile = useStore((s) => s.createFile);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding && inputRef.current) inputRef.current.focus();
  }, [adding]);

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) { setAdding(false); return; }
    createFile(name);
    setAdding(false);
    setNewName('');
  };

  const nonFolder = files.filter((f) => f.type !== 'folder');
  const folders = files.filter((f) => f.type === 'folder');

  return (
    <div className="file-explorer">
      <div className="explorer-head">
        <span>EXPLORER</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{files.length} FILES</span>
          <button
            className="new-file-btn"
            onClick={() => setAdding(true)}
            title="新建 Markdown 文件"
          >+</button>
        </div>
      </div>
      <div className="files">
        {adding && (
          <div className="new-file-row">
            <input
              ref={inputRef}
              className="new-file-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setAdding(false); }}
              onBlur={handleCreate}
              placeholder="文件名.md"
            />
          </div>
        )}
        {nonFolder.map((f) => (
          <div
            key={f.id}
            className={`file-item${f.id === activeFileId ? ' active' : ''}`}
            onClick={() => selectFile(f.id)}
          >
            <span className={`pill ${TYPE_PILLS[f.type] ?? 'yellow'}`} />
            <span className="file-name">{f.name}</span>
            <span className="file-meta">{f.type}</span>
          </div>
        ))}
        {folders.map((f) => (
          <div
            key={f.id}
            className="file-item folder-item"
            onClick={() => selectFile(f.id)}
          >
            <span className="file-name">📁 {f.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

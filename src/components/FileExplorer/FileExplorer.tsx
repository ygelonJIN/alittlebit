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
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['group:a', 'group:b']));

  const toggleLight = useStore((s) => s.toggleLight);

  useEffect(() => {
    if (adding && inputRef.current) inputRef.current.focus();
  }, [adding]);

  const toggleGroup = (groupId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) { setAdding(false); return; }
    createFile(name);
    setAdding(false);
    setNewName('');
  };

  const groups = files.filter((f) => f.type === 'folder' && f.children !== undefined);
  const rootFiles = files.filter((f) => !(f.type === 'folder' && f.children !== undefined));

  const totalCount = groups.reduce((sum, g) => sum + (g.children?.length ?? 0), 0) + rootFiles.length;

  return (
    <div className="file-explorer">
      <div className="explorer-head">
        <span>EXPLORER</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{totalCount} FILES</span>
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
        {groups.map((group) => {
          const isExpanded = expanded.has(group.id);
          const groupClass = group.category === 'a' ? 'group-a' : group.category === 'b' ? 'group-b' : group.category === 'c' ? 'group-c' : 'group-d';
          return (
            <div key={group.id} className={`file-group ${groupClass}`}>
              <div
                className={`file-item group-header${isExpanded ? ' expanded' : ''}`}
                onClick={() => toggleGroup(group.id)}
              >
                <span className="group-arrow">{isExpanded ? '▶' : '▸'}</span>
                <span className="file-name">{group.name}</span>
                <span className="file-meta">{group.children?.length ?? 0} files</span>
              </div>
              {isExpanded && group.children?.map((f) => (
                <div
                  key={f.id}
                  className={`file-item file-child${f.id === activeFileId ? ' active' : ''}`}
                  onClick={() => selectFile(f.id)}
                >
                  {group.category === 'a' ? (
                    <span
                      className={`pill light-pill${f.light === 'green' ? ' light-green' : f.light === 'yellow' ? ' light-yellow' : ''}`}
                      onClick={(e) => { e.stopPropagation(); toggleLight(f.id); }}
                      title={f.light === 'green' ? '绿灯：已锁定' : f.light === 'yellow' ? '黄灯：系统建议完成，点击确认' : '灰灯：待确认'}
                    />
                  ) : null}
                  <span className="file-name">{f.name}</span>
                  <span className="file-meta">{f.type}</span>
                </div>
              ))}
            </div>
          );
        })}
        {rootFiles.map((f) => (
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
      </div>
    </div>
  );
}

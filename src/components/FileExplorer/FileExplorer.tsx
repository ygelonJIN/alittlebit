import { useState, useRef, useEffect, useMemo } from 'react';
import type { FileItem } from '../../data/files';
import { useStore } from '../../store';
import LiquidEther from '../LiquidEther/LiquidEther';
import TextLoop from '../TextLoop/TextLoop';
import './FileExplorer.css';

interface Props {
  files: FileItem[];
}

function getAccentColors(): string[] {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const isDark = root.dataset.theme !== 'light';
  return [
    isDark ? '#000000' : '#ffffff',
    style.getPropertyValue('--accent-solid').trim() || '#7c3aed',
    style.getPropertyValue('--accent-1').trim() || '#241549',
  ];
}

function getAccentHex(varName: string, fallback: string): string {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  return style.getPropertyValue(varName).trim() || fallback;
}

export default function FileExplorer({ files }: Props) {
  const activeFileId = useStore((s) => s.activeFileId);
  const selectFile = useStore((s) => s.selectFile);
  const createFile = useStore((s) => s.createFile);
  const resetFile = useStore((s) => s.resetFile);
  const deleteFile = useStore((s) => s.deleteFile);
  const renameFile = useStore((s) => s.renameFile);
  const confirmAndExec = useStore((s) => s.confirmAndExec);
  const pendingAction = useStore((s) => s.pendingAction);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['group:a', 'group:b']));
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editFileName, setEditFileName] = useState('');

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

  const handleFileRename = (id: string) => {
    const name = editFileName.trim();
    if (name) renameFile(id, name);
    setEditingFileId(null);
  };

  const groups = files.filter((f) => f.type === 'folder' && f.children !== undefined);
  const rootFiles = files.filter((f) => !(f.type === 'folder' && f.children !== undefined));

  const totalCount = groups.reduce((sum, g) => sum + (g.children?.length ?? 0), 0) + rootFiles.length;

  return (
    <div className="file-explorer" style={{ position: 'relative' }}>
      <LiquidEther
        colors={getAccentColors()}
        mouseForce={40}
        cursorSize={40}
        resolution={0.6}
        autoDemo={true}
        autoSpeed={0.5}
        autoIntensity={3}
        takeoverDuration={0.25}
        autoResumeDelay={3000}
        autoRampDuration={0.6}
        isBounce={true}
        isViscous={false}
        iterationsPoisson={16}
        style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}
      />
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
          const groupClass = group.category === 'a' ? 'group-a' : group.category === 'b' ? 'group-b' : group.category === 'c' ? 'group-c' : group.category === 'x' ? 'group-x' : 'group-d';
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
              {isExpanded && group.children?.map((f) => {
                const isActive = f.id === activeFileId;
                const showReset = isActive && f.hasTemplate && f.light !== 'green';
                const showDelete = isActive && f.createdByUser && f.light !== 'green';
                const showLight = group.category === 'a' || group.category === 'x';
                const confirmingReset = pendingAction?.id === f.id && pendingAction?.action === 'reset';
                const confirmingDelete = pendingAction?.id === f.id && pendingAction?.action === 'delete';
                const canRename = f.createdByUser || group.category === 'x';
                return (
                <div
                  key={f.id}
                  className={`file-item file-child${isActive ? ' active' : ''}`}
                  onClick={() => selectFile(f.id)}
                >
                  {f.light === 'green' && (
                    <TextLoop
                      text="locked"
                      shape="line"
                      speed={120}
                      direction="forward"
                      separator="•"
                      curviness={0}
                      fontSize={200}
                      fontWeight={300}
                      letterSpacing={10}
                      uppercase
                      color={getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#edf4ff'}
                      ribbon={false}
                      ribbonColor={getAccentHex('--accent-2', '#1a1030')}
                      ribbonWidth={0}
                      pauseOnHover={false}
                      style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    />
                  )}
                  {showLight ? (
                    null
                  ) : null}
                  {editingFileId === f.id ? (
                    <input
                      className="file-name-input"
                      value={editFileName}
                      onChange={(e) => setEditFileName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleFileRename(f.id); if (e.key === 'Escape') setEditingFileId(null); }}
                      onBlur={() => handleFileRename(f.id)}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span
                      className={`file-name${showLight ? ' name-btn' : ''}${f.light === 'green' ? ' name-locked' : ''}${isActive ? ' active' : ''}`}
                      onClick={showLight ? (e) => { e.stopPropagation(); toggleLight(f.id); } : undefined}
                      onDoubleClick={canRename && !showLight ? (e) => { e.stopPropagation(); setEditingFileId(f.id); setEditFileName(f.name); } : undefined}
                      title={showLight ? (f.light === 'green' ? '已锁定（点击解锁）' : '待确认（点击锁定）') : undefined}
                    >
                      <span style={{ position: 'relative', zIndex: 1 }}>{f.name}</span>
                    </span>
                  )}
                  {f.hasTemplate ? (
                    <button
                      className={`file-action-btn reset${confirmingReset ? ' confirming' : ''}`}
                      style={{ visibility: showReset || confirmingReset ? 'visible' : 'hidden' }}
                      onClick={(e) => { e.stopPropagation(); confirmAndExec(f.id, 'reset'); }}
                      title={confirmingReset ? '再次点击确认重置' : '重置为模板内容'}
                    >{confirmingReset ? '✓' : 'reset'}</button>
                  ) : f.createdByUser ? (
                    <button
                      className={`file-action-btn delete${confirmingDelete ? ' confirming' : ''}`}
                      style={{ visibility: showDelete || confirmingDelete ? 'visible' : 'hidden' }}
                      onClick={(e) => { e.stopPropagation(); confirmAndExec(f.id, 'delete'); }}
                      title={confirmingDelete ? '再次点击确认删除' : '删除文件'}
                    >{confirmingDelete ? '✓' : 'delete'}</button>
                  ) : (
                    <span className="file-action-spacer" />
                  )}
                </div>
                );
              })}
            </div>
          );
        })}
        {rootFiles.map((f) => (
          <div
            key={f.id}
            className={`file-item${f.id === activeFileId ? ' active' : ''}`}
            onClick={() => selectFile(f.id)}
          >
            {editingFileId === f.id ? (
              <input
                className="file-name-input"
                value={editFileName}
                onChange={(e) => setEditFileName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleFileRename(f.id); if (e.key === 'Escape') setEditingFileId(null); }}
                onBlur={() => handleFileRename(f.id)}
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="file-name" onDoubleClick={(e) => { e.stopPropagation(); setEditingFileId(f.id); setEditFileName(f.name); }}>{f.name}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

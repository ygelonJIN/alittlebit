import { useState, useRef, useEffect } from 'react';
import type { VersionItem } from '../../data/versions';
import { useStore } from '../../store';
import './TopVersionBar.css';

interface Props {
  versions: VersionItem[];
}

export default function TopVersionBar({ versions }: Props) {
  const activeVersionId = useStore((s) => s.activeVersionId);
  const selectVersion = useStore((s) => s.selectVersion);
  const locklockVersion = useStore((s) => s.locklockVersion);
  const createNextVersion = useStore((s) => s.createNextVersion);
  const renameVersion = useStore((s) => s.renameVersion);

  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming && inputRef.current) inputRef.current.select();
  }, [renaming]);

  const startRename = (v: VersionItem) => {
    if (v.locked && v.id !== activeVersionId) return;
    setRenaming(v.id);
    setRenameValue(v.title);
  };

  const commitRename = () => {
    if (renaming && renameValue.trim()) {
      renameVersion(renaming, renameValue.trim());
    }
    setRenaming(null);
    setRenameValue('');
  };

  return (
    <div className="top-version-bar">
      {versions.map((v) => {
        const isActive = v.id === activeVersionId;
        return (
          <div
            key={v.id}
            className={`ver-tab${isActive ? ' active' : ''}${v.locked ? ' locked' : ''}`}
            onClick={() => selectVersion(v.id)}
            onDoubleClick={(e) => { e.stopPropagation(); startRename(v); }}
          >
            {renaming === v.id ? (
              <input
                ref={inputRef}
                className="ver-tab-rename"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null); }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                <span className="ver-tab-btn-left">
                  <button
                    className="ver-tab-btn"
                    onClick={(e) => { e.stopPropagation(); locklockVersion(v.id); }}
                    title={v.locked ? '解锁' : '锁定'}
                  >
                    {v.locked ? 'unlock' : 'lock'}
                  </button>
                </span>
                <span className="ver-tab-name">{v.title}</span>
                <span className="ver-tab-actions">
                  <button
                    className="ver-tab-btn"
                    onClick={(e) => { e.stopPropagation(); createNextVersion(v.id); }}
                    title="派生下一版本"
                  >
                    next
                  </button>
                </span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

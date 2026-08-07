import { useEffect, useState, useRef } from 'react';
import FileExplorer from './components/FileExplorer/FileExplorer';
import MarkdownEditor from './components/MarkdownEditor/MarkdownEditor';
import ChatPanel from './components/ChatPanel/ChatPanel';
import StatusBar from './components/StatusBar/StatusBar';
import SettingsModal from './components/SettingsModal/SettingsModal';
import { useStore } from './store';
import Toast from './components/Toast/Toast';
import './App.css';

export default function App() {
  const versions = useStore((s) => s.versions);
  const files = useStore((s) => s.files);
  const activeFileId = useStore((s) => s.activeFileId);
  const isReadOnly = useStore((s) => s.isReadOnly);
  const activeVersionId = useStore((s) => s.activeVersionId);
  const questionCount = useStore((s) => s.questionCount);
  const questionGen = useStore((s) => s.questionGen);
  const setQuestionCount = useStore((s) => s.setQuestionCount);
  const selectVersion = useStore((s) => s.selectVersion);
  const locklockVersion = useStore((s) => s.locklockVersion);
  const createNextVersion = useStore((s) => s.createNextVersion);
  const deleteVersion = useStore((s) => s.deleteVersion);
  const renameVersion = useStore((s) => s.renameVersion);
  const confirmAndExec = useStore((s) => s.confirmAndExec);
  const pendingAction = useStore((s) => s.pendingAction);
  const apiKey = useStore((s) => s.apiKey);
  const isLoading = useStore((s) => s.isLoading);
  const lines = useStore((s) => s.lines);
  const activeLineId = useStore((s) => s.activeLineId);
  const activeLine = lines.find((l) => l.id === activeLineId);
  const [showSettings, setShowSettings] = useState(false);
  const [showQDropdown, setShowQDropdown] = useState(false);
  const [cursorCol, setCursorCol] = useState(1);
  const [editingVerId, setEditingVerId] = useState<string | null>(null);
  const [editVerName, setEditVerName] = useState('');

  const [verStart, setVerStart] = useState(0);
  const [verCount, setVerCount] = useState(versions.length);
  const verRef = useRef<HTMLDivElement>(null);

  const [leftW, setLeftW] = useState(268);
  const [rightW, setRightW] = useState(460);
  const [dragging, setDragging] = useState<null | 'l' | 'r'>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const SPLITTER_W = 6;

  useEffect(() => { selectVersion(activeVersionId); }, []);

  useEffect(() => {
    const MIN_TAB = 220;
    const calc = () => { if (verRef.current) setVerCount(Math.max(1, Math.floor(verRef.current.getBoundingClientRect().width / MIN_TAB))); };
    calc();
    const ro = new ResizeObserver(calc);
    if (verRef.current) ro.observe(verRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const idx = versions.findIndex((v: any) => v.id === activeVersionId);
    if (idx < 0) return;
    setVerStart((prev) => { if (idx < prev) return idx; if (idx >= prev + verCount) return Math.max(0, idx - verCount + 1); return prev; });
  }, [activeVersionId, verCount, versions]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging || !layoutRef.current) return;
      const rect = layoutRef.current.getBoundingClientRect();
      const total = rect.width - SPLITTER_W * 2;
      const x = e.clientX - rect.left;
      if (dragging === 'l') setLeftW(Math.max(220, Math.min(x, total - rightW - 420)));
      else setRightW(Math.max(360, total - Math.max(leftW + SPLITTER_W + 420, x)));
    };
    const onUp = () => { setDragging(null); document.body.style.cursor = ''; document.body.style.userSelect = ''; };
    if (dragging) {
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    }
  }, [dragging, leftW, rightW]);

  const handleVerRename = (id: string) => {
    const name = editVerName.trim();
    if (name) renameVersion(id, name);
    setEditingVerId(null);
  };

  const visibleVersions = versions.slice(verStart, verStart + verCount);
  const showArrows = versions.length > verCount;
  const maxVerStart = Math.max(0, versions.length - verCount);
  const middleW = Math.max(420, (layoutRef.current?.getBoundingClientRect().width ?? 1448) - SPLITTER_W * 2 - leftW - rightW);

  return (
    <div className="app">
      <div className="shell">
        <div className="titlebar">
          <div className="traffic">
            <span className="dot red" /><span className="dot yellow" /><span className="dot green" />
          </div>
          <div className="title">AI 项目计划生成系统</div>
          <div className="titlebar-right">
            <div className="titlebar-dropdown">
              <button className="titlebar-settings" onClick={() => setShowQDropdown(!showQDropdown)}>单次提问数量 {questionCount}</button>
              {questionGen && questionGen.status !== 'done' && !(questionGen.status === 'first' && questionGen.actualCount === 0) && (
                <span className={`qg-badge qg-${questionGen.status}`} title={questionGen.warnings.join('; ')}>
                  {questionGen.status === 'filling' ? `补缺 ${questionGen.fillCount}` :
                   questionGen.status === 'retrying' ? '已重试' :
                   questionGen.status === 'failed' ? `未达标 ${questionGen.actualCount}/${questionGen.targetCount}` : ''}
                </span>
              )}
              {showQDropdown && (
                <div className="dropdown-menu">
                  {[1,3,5,10,20,30,50,100].map(n => (
                    <div key={n} className="dropdown-item" onClick={() => { setQuestionCount(n); setShowQDropdown(false); }}>{n} 个问题</div>
                  ))}
                </div>
              )}
            </div>
            <button className="titlebar-settings" onClick={() => setShowSettings(true)}>设置</button>
            <span className={`titlebar-status ${isLoading ? 'thinking' : apiKey ? 'ready' : 'no-key'}`}>{isLoading ? 'Thinking...' : apiKey ? 'Ready' : 'No API Key'}</span>
          </div>
        </div>
        <div className="layout">
          <div className="ver-bar-row">
            {showArrows && <button className="ver-nav-btn" onClick={() => setVerStart(v => Math.max(0, v - verCount))} disabled={verStart === 0}>◀</button>}
            <div className="ver-bar-shared" ref={verRef}>
              {(showArrows ? visibleVersions : versions).map((v: any) => {
                const isActive = v.id === activeVersionId;
                const confirmingDelVer = pendingAction?.id === v.id && pendingAction?.action === 'deleteVer';
                return (
                  <div key={v.id} className={`ver-tab-inline${isActive ? ' active' : ''}${v.locked ? ' locked' : ''}`} onClick={() => selectVersion(v.id)}>
                    <span className={`ver-lock-pill${v.locked ? ' locked' : ''}`} onClick={(e) => { e.stopPropagation(); locklockVersion(v.id); }} title={v.locked ? '解锁' : '锁定'} />
                    {editingVerId === v.id ? (
                      <input
                        className="ver-name-input"
                        value={editVerName}
                        onChange={(e) => setEditVerName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleVerRename(v.id); if (e.key === 'Escape') setEditingVerId(null); }}
                        onBlur={() => handleVerRename(v.id)}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="ver-tab-name" onDoubleClick={(e) => { e.stopPropagation(); setEditingVerId(v.id); setEditVerName(v.title); }}>
                        {v.title}
                      </span>
                    )}
                    <span className="ver-actions">
                      <button className="ver-delete-btn" onClick={(e) => { e.stopPropagation(); confirmAndExec(v.id, 'deleteVer'); }} style={{ visibility: isActive ? 'visible' : 'hidden' }}>{confirmingDelVer ? '✓' : 'delete'}</button>
                      <button className="ver-next-btn" onClick={(e) => { e.stopPropagation(); createNextVersion(v.id); }} style={{ visibility: isActive ? 'visible' : 'hidden' }}>next</button>
                    </span>
                  </div>
                );
              })}
            </div>
            {showArrows && <button className="ver-nav-btn" onClick={() => setVerStart(v => Math.min(maxVerStart, v + verCount))} disabled={verStart >= maxVerStart}>▶</button>}
          </div>
          <div className="layout-row" ref={layoutRef}>
            <div className="pane" style={{ width: leftW, flexShrink: 0 }}><FileExplorer files={files} /></div>
            <div className="splitter" onPointerDown={() => setDragging('l')} />
            <div className="pane" style={{ width: middleW, flexShrink: 0 }}><MarkdownEditor isReadOnly={isReadOnly} onCursorMove={(_, col) => setCursorCol(col)} /></div>
            <div className="splitter" onPointerDown={() => setDragging('r')} />
            <div className="pane" style={{ width: rightW, flexShrink: 0 }}><ChatPanel isReadOnly={isReadOnly} /></div>
          </div>
        </div>
        <StatusBar isReadOnly={isReadOnly} lineNumber={activeLine?.lineNumber} colNumber={cursorCol} totalLines={lines.length} />
      </div>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <Toast />
    </div>
  );
}

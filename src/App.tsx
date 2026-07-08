import { useEffect, useState } from 'react';
import FileExplorer from './components/FileExplorer/FileExplorer';
import MarkdownEditor from './components/MarkdownEditor/MarkdownEditor';
import ChatPanel from './components/ChatPanel/ChatPanel';
import StatusBar from './components/StatusBar/StatusBar';
import SettingsModal from './components/SettingsModal/SettingsModal';
import { useStore } from './store';
import './App.css';

export default function App() {
  const versions = useStore((s) => s.versions);
  const files = useStore((s) => s.files);
  const activeFileId = useStore((s) => s.activeFileId);
  const activeFile = (() => {
    for (const g of files) {
      if (g.id === activeFileId) return g;
      if (g.children) { const f = g.children.find(c => c.id === activeFileId); if (f) return f; }
    }
    return null;
  })();
  const isReadOnly = useStore((s) => s.isReadOnly);
  const activeVersionId = useStore((s) => s.activeVersionId);
  const questionCount = useStore((s) => s.questionCount);
  const setQuestionCount = useStore((s) => s.setQuestionCount);
  const selectVersion = useStore((s) => s.selectVersion);
  const locklockVersion = useStore((s) => s.locklockVersion);
  const createNextVersion = useStore((s) => s.createNextVersion);
  const apiKey = useStore((s) => s.apiKey);
  const isLoading = useStore((s) => s.isLoading);
  const lines = useStore((s) => s.lines);
  const activeLineId = useStore((s) => s.activeLineId);
  const activeLine = lines.find((l) => l.id === activeLineId);
  const [showSettings, setShowSettings] = useState(false);
  const [showQDropdown, setShowQDropdown] = useState(false);
  const [cursorCol, setCursorCol] = useState(1);

  useEffect(() => {
    selectVersion(activeVersionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app">
      <div className="shell">
        <div className="titlebar">
          <div className="traffic">
            <span className="dot red" />
            <span className="dot yellow" />
            <span className="dot green" />
          </div>
          <div className="title">AI 项目计划生成系统</div>
          <div className="titlebar-right">
            <div className="titlebar-dropdown">
              <button className="titlebar-settings" onClick={() => setShowQDropdown(!showQDropdown)}>
                单次提问数量 {questionCount}
              </button>
              {showQDropdown && (
                <div className="dropdown-menu">
                  {[1,3,5,10,20,30,50,100].map(n => (
                    <div key={n} className="dropdown-item" onClick={() => { setQuestionCount(n); setShowQDropdown(false); }}>
                      {n} 个问题
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button className="titlebar-settings" onClick={() => setShowSettings(true)} title="Settings">设置</button>
            <span className="titlebar-status">{isLoading ? 'Thinking...' : apiKey ? 'Ready' : 'No API Key'}</span>
          </div>
        </div>
        <div className="layout">
          <FileExplorer files={files} />
          <div className="editor-chat-col">
            <div className="ver-bar-wrapper">
              <div className="ver-bar-shared" onWheel={(e) => { e.currentTarget.scrollLeft += e.deltaY; }}>
              {versions.map((v) => {
                const isActive = v.id === activeVersionId;
                return (
                  <div key={v.id} className={`ver-tab-inline${isActive ? ' active' : ''}${v.locked ? ' locked' : ''}`} onClick={() => selectVersion(v.id)}>
                    <button className="ver-tab-btn" onClick={(e) => { e.stopPropagation(); locklockVersion(v.id); }} title={v.locked ? '解锁' : '锁定'}>
                      {v.locked ? 'unlock' : 'lock'}
                    </button>
                    <span className="ver-tab-name">{v.title}</span>
                    <button className="ver-tab-btn" onClick={(e) => { e.stopPropagation(); createNextVersion(v.id); }} title="派生">
                      next
                    </button>
                  </div>
                );
              })}
            </div>
            </div>
            <div className="editor-chat-row">
              <MarkdownEditor isReadOnly={isReadOnly} onCursorMove={(_, col) => setCursorCol(col)} />
              <ChatPanel isReadOnly={isReadOnly} />
            </div>
          </div>
        </div>
        <StatusBar isReadOnly={isReadOnly} lineNumber={activeLine?.lineNumber} colNumber={cursorCol} />
      </div>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

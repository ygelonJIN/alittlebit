import { useEffect, useState } from 'react';
import TopVersionBar from './components/TopVersionBar/TopVersionBar';
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
  const isReadOnly = useStore((s) => s.isReadOnly);
  const selectVersion = useStore((s) => s.selectVersion);
  const activeVersionId = useStore((s) => s.activeVersionId);
  const questionCount = useStore((s) => s.questionCount);
  const setQuestionCount = useStore((s) => s.setQuestionCount);
  const [showSettings, setShowSettings] = useState(false);
  const [showQDropdown, setShowQDropdown] = useState(false);

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
          <div className="crumbs">/Volumes/.../AI_项目计划生成系统.md</div>
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
        </div>
        <TopVersionBar versions={versions} />
        <div className="layout">
          <FileExplorer files={files} />
          <MarkdownEditor isReadOnly={isReadOnly} />
          <ChatPanel isReadOnly={isReadOnly} />
        </div>
        <StatusBar isReadOnly={isReadOnly} />
      </div>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

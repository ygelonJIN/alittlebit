import { useEffect, useState, useRef } from 'react';
import { useStore } from '../../store';
import './SettingsModal.css';

interface Props {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: Props) {
  const apiKey = useStore((s) => s.apiKey);
  const apiEndpoint = useStore((s) => s.apiEndpoint);
  const theme = useStore((s) => s.theme);
  const accent = useStore((s) => s.accent);
  const setApiKey = useStore((s) => s.setApiKey);
  const setApiEndpoint = useStore((s) => s.setApiEndpoint);
  const setTheme = useStore((s) => s.setTheme);
  const setAccent = useStore((s) => s.setAccent);
  const [key, setKey] = useState(apiKey);
  const [endpoint, setEndpoint] = useState(apiEndpoint);
  const [themeValue, setThemeValue] = useState(theme);
  const [accentValue, setAccentValue] = useState(accent);
  const colorInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setKey(apiKey);
    setEndpoint(apiEndpoint);
    setThemeValue(theme);
    setAccentValue(accent);
  }, [apiKey, apiEndpoint, theme, accent]);

  const handleSave = () => {
    setApiKey(key.trim());
    setApiEndpoint(endpoint.trim() || 'https://api.deepseek.com/v1/chat/completions');
    setTheme(themeValue);
    setAccent(accentValue);
    onClose();
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span>Settings</span>
          <button className="settings-close" onClick={onClose}>×</button>
        </div>
        <div className="settings-body">
          <div className="settings-field">
            <label className="settings-label">Theme</label>
            <div className="settings-segmented">
              <button className={themeValue === 'dark' ? 'settings-seg active' : 'settings-seg'} onClick={() => setThemeValue('dark')}>Dark</button>
              <button className={themeValue === 'light' ? 'settings-seg active' : 'settings-seg'} onClick={() => setThemeValue('light')}>Light</button>
            </div>
          </div>
          <div className="settings-field">
            <label className="settings-label">Accent Color</label>
            <div className="settings-color-row">
              <input
                ref={colorInputRef}
                className="settings-color-picker"
                type="color"
                value={accentValue}
                onChange={(e) => setAccentValue(e.target.value)}
              />
              <input
                className="settings-input"
                type="text"
                value={accentValue.replace('#', '')}
                onChange={(e) => setAccentValue('#' + e.target.value.replace(/[^0-9a-fA-F]/g, ''))}
                placeholder="7c3aed"
                maxLength={6}
              />
            </div>
          </div>
          <div className="settings-field">
            <label className="settings-label">API Endpoint</label>
            <input
              className="settings-input"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://api.deepseek.com/v1/chat/completions"
            />
          </div>
          <div className="settings-field">
            <label className="settings-label">API Key</label>
            <input
              className="settings-input"
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-..."
              autoFocus
            />
          </div>
          <div className="settings-actions">
            <button className="settings-btn" onClick={onClose}>Cancel</button>
            <button className="settings-btn" onClick={handleSave}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useStore } from '../../store';
import './SettingsModal.css';

interface Props {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: Props) {
  const apiKey = useStore((s) => s.apiKey);
  const apiEndpoint = useStore((s) => s.apiEndpoint);
  const setApiKey = useStore((s) => s.setApiKey);
  const setApiEndpoint = useStore((s) => s.setApiEndpoint);
  const [key, setKey] = useState(apiKey);
  const [endpoint, setEndpoint] = useState(apiEndpoint);

  const handleSave = () => {
    setApiKey(key.trim());
    setApiEndpoint(endpoint.trim() || 'https://api.deepseek.com/v1/chat/completions');
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
            <button className="settings-btn primary" onClick={handleSave}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

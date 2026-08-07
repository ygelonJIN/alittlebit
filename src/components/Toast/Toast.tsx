import { useEffect, useState, useCallback } from 'react';
import './Toast.css';

interface ToastMessage {
  id: number;
  text: string;
  type: 'error';
}

let nextId = 0;

export function showToast(text: string, type: 'error' = 'error') {
  window.dispatchEvent(new CustomEvent('toast', { detail: { text, type } }));
}

export default function Toast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((text: string, type: 'error') => {
    const id = nextId++;
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => dismiss(id), 3500);
  }, [dismiss]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { text, type } = (e as CustomEvent).detail;
      addToast(text, type || 'error');
    };
    window.addEventListener('toast', handler);
    return () => window.removeEventListener('toast', handler);
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast-item${t.type === 'error' ? ' error' : ''} visible`}>
          <span className="toast-msg">{t.text}</span>
          <button className="toast-close" onClick={() => dismiss(t.id)}>×</button>
        </div>
      ))}
    </div>
  );
}

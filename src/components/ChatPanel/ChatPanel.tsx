import { useStore } from '../../store';
import './ChatPanel.css';

interface Props {
  isReadOnly: boolean;
}

function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  html = html
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '• $1');
  html = html.replace(/\n/g, '<br/>');
  return html;
}

export default function ChatPanel({ isReadOnly }: Props) {
  const messages = useStore((s) => s.messages);
  const inputText = useStore((s) => s.inputText);
  const setInputText = useStore((s) => s.setInputText);
  const sendMessage = useStore((s) => s.sendMessage);
  const isLoading = useStore((s) => s.isLoading);
  const apiKey = useStore((s) => s.apiKey);
  const activeVersionId = useStore((s) => s.activeVersionId);
  const generateVersionFiles = useStore((s) => s.generateVersionFiles);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="chat">
      <div className="chat-head">
        <span>AI Chat</span>
        <span>{isReadOnly ? 'READ ONLY' : isLoading ? 'Thinking...' : apiKey ? 'Ready' : 'No API Key'}</span>
      </div>
      <div className="chat-body">
        {messages.map((m) => (
          m.role === 'user' ? (
            <div key={m.id} className="msg user">{m.content}</div>
          ) : (
            <div key={m.id} className="msg" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
          )
        ))}
        {isLoading && (
          <div className="msg"><em>AI 思考中...</em></div>
        )}
        <div className="msg" style={{ border: '1px solid var(--accent)', cursor: 'pointer', padding: '8px 12px', borderRadius: 6 }} onClick={() => generateVersionFiles(activeVersionId)}>
          📄 写入文档（生成摘要/日志/正文/差异到 letsgo）
        </div>
      </div>
      <div className="composer">
        <div className={`input${isReadOnly ? ' readonly' : ''}`}>
          <textarea
            className="input-textarea"
            value={isReadOnly ? '' : inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isReadOnly ? '版本已锁定，只读' : isLoading ? 'AI 回复中...' : '输入想法或目标...'}
            rows={3}
            disabled={isReadOnly || isLoading}
          />
          <div className="footer">
            <div className="hint">{isReadOnly ? '版本已锁定' : isLoading ? '请等待...' : 'Enter to send'}</div>
            <button className="btn" onClick={sendMessage} disabled={isReadOnly || isLoading}>发送</button>
          </div>
        </div>
      </div>
    </div>
  );
}

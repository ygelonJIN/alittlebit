import { useState, useRef } from 'react';
import { useStore } from '../../store';
import './ChatPanel.css';

interface Props {
  isReadOnly: boolean;
}

interface QuestionOption {
  label: string;
  desc: string;
}

interface ParsedQuestion {
  text: string;
  options: QuestionOption[];
}

function parseQuestions(content: string): { restContent: string; questions: ParsedQuestion[] } {
  const qMatch = content.match(/### 本轮问题\n([\s\S]*?)(?=\n### |$)/);
  if (!qMatch) return { restContent: content, questions: [] };
  const qBlock = qMatch[1];
  const restContent = content.replace(qMatch[0], '').trim();

  const questions: ParsedQuestion[] = [];
  let parts = qBlock.split(/\n(?=\d+\s*\n)/);
  if (parts.length === 1) parts = qBlock.split(/\n(?=\d+[.)]\s)/);

  for (const part of parts) {
    const lines = part.split('\n');
    const firstLine = lines[0]?.trim() || '';
    let questionText = '';
    let optStart = 1;
    if (/^\d+$/.test(firstLine)) {
      if (lines[1] && !/^[-–]\s*[A-C][.：)]/.test(lines[1].trim()) && !/^[A-C][.)]\s/.test(lines[1].trim())) {
        questionText = lines[1].trim().replace(/^\d+\.\s*\**|\**$/g, '').trim();
        optStart = 2;
      } else {
        questionText = '';
        optStart = 1;
      }
    } else {
      questionText = firstLine.replace(/^\d+\s*/, '').replace(/\*\*/g, '');
      optStart = 1;
    }
    if (!questionText && optStart === 1 && lines[1]) questionText = lines[1].trim().replace(/\*\*/g, '');

    const options: QuestionOption[] = [];
    for (let i = optStart; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const m = line.match(/^[-–]?\s*([A-C])[.：)]\s*(.+)/);
      if (m) {
        const rest = m[2];
        const descIdx = Math.max(rest.indexOf('例如'), rest.indexOf('适合'), rest.indexOf('用于'), rest.indexOf('衡量'), rest.indexOf('（'));
        const label = descIdx > 0 ? rest.slice(0, descIdx).replace(/[，,]\s*$/, '').trim() : rest;
        const desc = descIdx > 0 ? rest.slice(descIdx) : '';
        options.push({ label: m[1] + '. ' + label, desc });
      } else if (!questionText) {
        questionText = line.replace(/\*\*/g, '');
      }
    }
    // Add self-fill option
    options.push({ label: '自行填写', desc: '输入你的答案' });
    if (questionText || options.length > 0) {
      questions.push({ text: (questionText || '(选项题)').replace(/^\d+[.)、\s]+/, '').replace(/^[-•*]\s*/, '').replace(/^\d+\.\s*$/, '').trim() || '(选项题)', options });
    }
  }
  return { restContent, questions };
}

function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const sections = html.split(/(?=^### )/gm);
  const result: string[] = [];

  for (const sec of sections) {
    const headingMatch = sec.match(/^### (.+)/m);
    if (headingMatch) {
      const heading = headingMatch[1];
      if (heading.includes('本轮问题')) continue;
      const body = sec.replace(/^### .+\n?/, '');
      const cardClass = 'chat-card';
      const formatted = body
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br/>');
      result.push(
        `<div class="${cardClass}"><div class="chat-card-head">${heading}</div><div class="chat-card-body">${formatted}</div></div>`
      );
    } else {
      result.push(sec.replace(/\n/g, '<br/>'));
    }
  }

  return result.join('');
}

function QuestionCard({ questions, onSelectionChange, answersRef, customRef }: {
  questions: ParsedQuestion[];
  onSelectionChange?: (count: number) => void;
  answersRef?: React.MutableRefObject<Record<number, { label: string; custom: string }>>;
  customRef?: React.MutableRefObject<Record<number, string>>;
}) {
  if (questions.length === 0) return null;
  const [selected, setSelected] = useState<Record<number, number>>({});
  const [customAnswers, setCustomAnswers] = useState<Record<number, string>>({});

  const updateSelection = (qIdx: number, optIdx: number, optLabel: string, isCustom: boolean) => {
    const newCount = Object.keys({ ...selected, [qIdx]: optIdx }).length;
    setSelected(prev => ({ ...prev, [qIdx]: optIdx }));
    onSelectionChange?.(newCount);
    if (answersRef) {
      answersRef.current = { ...answersRef.current, [qIdx]: { label: optLabel, custom: customAnswers[qIdx] || '' } };
    }
  };

  return (
    <div className="questions-block">
      <div className="questions-head">本轮问题 {questions.length} 个</div>
      {questions.map((q, i) => (
        <div key={i} className="question-card">
          <div className="q-num">{i + 1}</div>
          <div className="q-main">
            {q.text && <div className="q-text">{q.text}</div>}
            {q.options.length > 0 && (
              <div className="q-options">
                {q.options.map((o, j) => {
                  const isSelfFill = o.label === '自行填写';
                  return (
                    <div
                      key={j}
                      className={`q-option${selected[i] === j ? ' q-selected' : ''}${isSelfFill ? ' q-self-fill' : ''}`}
                      onClick={() => {
                        updateSelection(i, j, o.label, isSelfFill);
                        if (!isSelfFill) {
                          setCustomAnswers(prev => { const n = {...prev}; delete n[i]; return n; });
                        }
                      }}
                    >
                      <span className={`q-radio${selected[i] === j ? ' q-checked' : ''}`} />
                      <div className="q-opt-body">
                        <span className="q-opt-label">{o.label}</span>
                        {isSelfFill && selected[i] === j && (
                          <input
                            className="q-self-input"
                            placeholder="输入你的答案..."
                            value={customAnswers[i] || ''}
                            onChange={(e) => {
                              setCustomAnswers(prev => ({ ...prev, [i]: e.target.value }));
                              if (customRef) customRef.current = { ...customRef.current, [i]: e.target.value };
                            }}
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                          />
                        )}
                        {o.desc && !isSelfFill && <span className="q-opt-desc">{o.desc}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
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
  const [expandedMsgs, setExpandedMsgs] = useState<Set<string>>(new Set());
  const isComposing = useRef(false);
  const [questionCompleted, setQuestionCompleted] = useState(0);
  const selectedAnswers = useRef<Record<number, { label: string; custom: string }>>({});
  const customRef = useRef<Record<number, string>>({});
  const [inputExpanded, setInputExpanded] = useState(false);

  const toggleMsg = (id: string) => {
    setExpandedMsgs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing.current && !isLoading) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleCompositionEnd = () => {
    isComposing.current = true;
    setTimeout(() => { isComposing.current = false; }, 0);
  };

  const handleSubmit = () => {
    const answers = selectedAnswers.current;
    const customs = customRef.current;
    const parts: string[] = [];
    for (const [idx, ans] of Object.entries(answers).sort(([a], [b]) => Number(a) - Number(b))) {
      const custom = customs[Number(idx)] || '';
      parts.push(`${Number(idx) + 1}. ${custom || ans.label}`);
    }
    if (parts.length > 0) {
      setInputText(parts.join('\n'));
      setTimeout(() => sendMessage(), 50);
    }
  };

  return (
    <div className="chat">
      <div className="chat-body">
        {messages.map((m) => {
            if (m.role === 'user') {
              return <div key={m.id} className="msg-user">{m.content}</div>;
            }
            const { restContent, questions } = parseQuestions(m.content);
            return (
              <div key={m.id} className="msg-assistant">
                <div
                  className="msg-markdown"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(restContent) }}
                />
                <QuestionCard questions={questions} onSelectionChange={setQuestionCompleted} answersRef={selectedAnswers} customRef={customRef} />
                {m.protocol && (
                  <div className="debug-toggle" onClick={() => toggleMsg(m.id)}>
                    {expandedMsgs.has(m.id) ? '▾' : '▸'} 协议详情
                  </div>
                )}
                {expandedMsgs.has(m.id) && m.protocol && (
                  <pre className="protocol-block">
                    {JSON.stringify(m.protocol, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        {isLoading && (
          <div className="loading-msg"><em>AI 思考中...</em></div>
        )}
        {(() => {
          let lastQuestionCount = 0;
          for (const m of messages) {
            if (m.role === 'assistant') {
              const { questions } = parseQuestions(m.content);
              if (questions.length > 0) lastQuestionCount = questions.length;
            }
          }
          const canSubmit = lastQuestionCount > 0 && questionCompleted >= lastQuestionCount;
          return (
            <div className="chat-actions">
              <button className="chat-submit-btn" disabled={isLoading || !canSubmit} onClick={handleSubmit}>提交</button>
              <button className="chat-doc-btn" disabled={isLoading} onClick={() => generateVersionFiles(activeVersionId)}>写入文档</button>
            </div>
          );
        })()}
      </div>
      <div className="composer">
        <div className={`input${isReadOnly ? ' readonly' : ''}`}>
          <button className="expand-btn" onClick={() => setInputExpanded(!inputExpanded)} title={inputExpanded ? '收起' : '放大'}>
            {inputExpanded ? '▾' : '▴'}
          </button>
          <textarea
            className="input-textarea"
            style={{ minHeight: inputExpanded ? 280 : 40 }}
            value={isReadOnly ? '' : inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => { isComposing.current = true; }}
            onCompositionEnd={handleCompositionEnd}
            placeholder={isReadOnly ? '版本已锁定，只读' : isLoading ? 'AI 回复中...' : '输入想法或目标...'}
            rows={3}
            disabled={isReadOnly || isLoading}
          />
          <div className="footer">
            <div className="hint">{isReadOnly ? '版本已锁定' : ''}</div>
            <button className="btn" onClick={sendMessage} disabled={isReadOnly || isLoading}>发送</button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
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
  const qMatch = content.match(/### 本轮问题\n([\s\S]*?)(?=\n### |\n```json\b|$)/);
  if (!qMatch) return { restContent: content, questions: [] };
  const qBlock = qMatch[1];
  const restContent = content.replace(qMatch[0], '').trim();

  const rawLines = qBlock.split('\n');
  const blocks: string[][] = [];
  let cur: string[] = [];
  for (const raw of rawLines) {
    const t = raw.trim();
    const isNumStart = /^\d+[.)、]?\s+/.test(t) || /^\d+\s*$/.test(t);
    if (isNumStart && cur.length > 0) { blocks.push(cur); cur = [raw]; }
    else { cur.push(raw); }
  }
  if (cur.length > 0) blocks.push(cur);

  const questions: ParsedQuestion[] = [];
  for (const block of blocks) {
    const bl = block.map(l => l.trim()).filter(Boolean);
    if (bl.length === 0) continue;
    const idMatch = bl[0].match(/^(\d+)[.)、]?\s*(.*)$/);
    if (!idMatch) continue;

    let questionText = idMatch[2]
      .replace(/\*\*/g, '').replace(/\*/g, '').replace(/^\.\s*/, '')
      .replace(/^[-–•]\s*/, '').replace(/\s+/g, ' ').trim();
    let optStart = 1;
    if (!questionText && bl.length > 1 && !/^[A-C][.：)]/.test(bl[1])) {
      questionText = bl[1].replace(/\*\*/g, '').replace(/\*/g, '')
        .replace(/^\.\s*/, '').replace(/^[-–•]\s*/, '').replace(/\s+/g, ' ').trim();
      optStart = 2;
    }

    const options: QuestionOption[] = [];
    let hasSelfFill = false;
    for (let i = optStart; i < bl.length; i++) {
      const line = bl[i];
      const m = line.match(/^[-–]?\s*([A-C])[.：)]\s*(.+)/);
      if (m) {
        const rest = m[2];
        const descIdx = Math.max(rest.indexOf('例如'), rest.indexOf('适合'), rest.indexOf('用于'), rest.indexOf('衡量'), rest.indexOf('（'));
        const label = descIdx > 0 ? rest.slice(0, descIdx).replace(/[，,]\s*$/, '').trim() : rest;
        const desc = descIdx > 0 ? rest.slice(descIdx) : '';
        options.push({ label: m[1] + '. ' + label, desc });
      } else if (line === '自行填写' || line.startsWith('自行填写')) {
        hasSelfFill = true;
      } else if (!questionText) {
        questionText = line.replace(/\*\*/g, '').replace(/\*/g, '').trim();
      }
    }
    const hasSelfFillOpt = options.some(o => o.label.startsWith('自行填写'));
    if (!hasSelfFill && !hasSelfFillOpt) {
      options.push({ label: '自行填写', desc: '输入你的答案' });
    }
    questions.push({ text: questionText, options });
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
    if (selected[qIdx] === optIdx) {
      // Deselect
      const next = { ...selected };
      delete next[qIdx];
      setSelected(next);
      const newCount = Object.keys(next).length;
      onSelectionChange?.(newCount);
      if (answersRef) {
        const nextAnswers = { ...answersRef.current };
        delete nextAnswers[qIdx];
        answersRef.current = nextAnswers;
      }
    } else {
      const newCount = Object.keys({ ...selected, [qIdx]: optIdx }).length;
      setSelected(prev => ({ ...prev, [qIdx]: optIdx }));
      onSelectionChange?.(newCount);
      if (answersRef) {
        answersRef.current = { ...answersRef.current, [qIdx]: { label: optLabel, custom: customAnswers[qIdx] || '' } };
      }
    }
  };

  return (
    <div className="questions-block">
      <div className="questions-head">本轮问题 {questions.length} 个</div>
      {questions.map((q, i) => (
        <div key={i} className="question-card">
          <div className="q-main">
            {q.text && <div className="q-text">{i + 1}. {q.text}</div>}
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
                            placeholder="请输入"
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
  const [expandedMsgs, setExpandedMsgs] = useState<Set<string>>(new Set());
  const isComposing = useRef(false);
  const [questionCompleted, setQuestionCompleted] = useState(0);
  const selectedAnswers = useRef<Record<number, { label: string; custom: string }>>({});
  const customRef = useRef<Record<number, string>>({});
  const [inputExpanded, setInputExpanded] = useState(false);
  const [activeMode, setActiveMode] = useState<'submit' | 'reply' | 'idea' | null>(null);
  const composerRef = useRef<HTMLDivElement>(null);

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
      doSend();
    }
  };

  const handleCompositionEnd = () => {
    isComposing.current = true;
    setTimeout(() => { isComposing.current = false; }, 0);
  };

  const submitOptions = () => {
    if (isLoading || isReadOnly) return;
    const answers = selectedAnswers.current;
    const customs = customRef.current;
    const parts: string[] = [];
    for (const [idx, ans] of Object.entries(answers).sort(([a], [b]) => Number(a) - Number(b))) {
      const custom = customs[Number(idx)] || '';
      parts.push(`${Number(idx) + 1}. ${custom || ans.label}`);
    }
    if (parts.length > 0) {
      const tagged = `【inputType=answer】\n` + parts.join('\n');
      setInputText(tagged);
      setTimeout(() => sendMessage(), 50);
    }
  };

  const doSend = () => {
    if (isLoading || isReadOnly) return;
    const text = inputText.trim();
    if (!text) return;
    if (activeMode === 'reply') {
      const tagged = `【inputType=answer】\n` + text;
      setInputText(tagged);
      setTimeout(() => sendMessage(), 50);
    } else {
      const tagged = `【inputType=idea】\n` + text;
      setInputText(tagged);
      setTimeout(() => sendMessage(), 50);
    }
  };

  const openMode = (mode: 'submit' | 'reply' | 'idea') => {
    setActiveMode(prev => prev === mode ? null : mode);
  };

  // Close composer when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (composerRef.current && !composerRef.current.contains(e.target as Node)) {
        setActiveMode(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  let lastQuestionCount = 0;
  for (const m of messages) {
    if (m.role === 'assistant') {
      const { questions } = parseQuestions(m.content);
      if (questions.length > 0) lastQuestionCount = questions.length;
    }
  }
  const hasQuestions = lastQuestionCount > 0;

  return (
    <div className="chat">
      <div className="chat-body">
        {messages.map((m) => {
            if (m.role === 'user') {
              return <div key={m.id} className="msg-user">{m.content.replace(/【inputType=(?:answer|idea)】\n/, '').replace(/【请在你的回复末尾输出.*?】\n\n/, '')}</div>;
            }
            const { restContent, questions } = parseQuestions(m.content);
            return (
              <div key={m.id} className="msg-assistant">
                <div
                  className="msg-markdown"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(restContent) }}
                />
                <QuestionCard questions={questions} onSelectionChange={setQuestionCompleted} answersRef={selectedAnswers} customRef={customRef} />
                {m.questionGenMeta?.attempted && (
                  <div className="qg-meta">
                    {m.questionGenMeta.fillCount > 0 ? `已补缺 ${m.questionGenMeta.fillCount} 个` : ''}
                    {m.questionGenMeta.retryCount > 0 ? `${m.questionGenMeta.fillCount > 0 ? ' · ' : ''}已重试 ${m.questionGenMeta.retryCount} 次` : ''}
                    {m.questionGenMeta.finalStatus === 'failed' ? `${m.questionGenMeta.attempted ? ' · ' : ''}最终未达标` : ''}
                    {m.questionGenMeta.warnings ? ` (${m.questionGenMeta.warnings})` : ''}
                  </div>
                )}
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
                {m.usage && (
                  <div className="token-usage">
                    提示词 {m.usage.prompt.toLocaleString()} + 补全 {m.usage.completion.toLocaleString()} = {m.usage.total.toLocaleString()} token
                  </div>
                )}
              </div>
            );
          })}
        {isLoading && (
          <div className="loading-msg"><em>AI 思考中...</em></div>
        )}
      </div>
      {(!hasQuestions || activeMode !== null || (hasQuestions && activeMode === null)) && (
        <div className="composer" ref={composerRef}>
          <div className={`input${isReadOnly ? ' readonly' : ''}`}>
            {hasQuestions && activeMode === null ? (
              <div className="mode-panel mode-panel-actions">
                <button className="chat-submit-btn" disabled={isLoading} onClick={submitOptions}>提交选项</button>
                <div className="chat-actions-right">
                  <button className={`chat-submit-btn small${activeMode === 'reply' ? ' active' : ''}`} disabled={isLoading} onClick={() => openMode('reply')}>自由回复</button>
                  <button className={`chat-submit-btn small${activeMode === 'idea' ? ' active' : ''}`} disabled={isLoading} onClick={() => openMode('idea')}>新增想法</button>
                </div>
              </div>
            ) : (
              <div className="mode-panel mode-panel-compose">
                <div className="textarea-wrap">
                  <textarea
                    className="input-textarea"
                    style={{ minHeight: inputExpanded ? 280 : 40 }}
                    value={isReadOnly ? '' : inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onCompositionStart={() => { isComposing.current = true; }}
                    onCompositionEnd={handleCompositionEnd}
                    placeholder="请输入"
                    rows={3}
                    disabled={isReadOnly || isLoading}
                  />
                  <button className="expand-btn" onClick={() => setInputExpanded(!inputExpanded)} title={inputExpanded ? '收起' : '放大'}>
                    <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 8 Q6 4 10 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M2 4.5 Q6 0.5 10 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </button>
                </div>
                <div className="footer">
                  <div className="hint">{isReadOnly ? '版本已锁定' : activeMode === 'reply' ? '快捷回复问题' : activeMode === 'idea' ? '新增想法或目标' : '新增想法或目标'}</div>
                  <button className="btn" onClick={doSend} disabled={isReadOnly || isLoading}>发送</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

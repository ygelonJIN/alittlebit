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
    for (let i = optStart; i < bl.length; i++) {
      const line = bl[i];
      const m = line.match(/^[-–]?\s*([A-C])[.：)]\s*(.+)/);
      if (m) {
        const rest = m[2];
        const descIdx = Math.max(rest.indexOf('例如'), rest.indexOf('适合'), rest.indexOf('用于'), rest.indexOf('衡量'), rest.indexOf('（'));
        const label = descIdx > 0 ? rest.slice(0, descIdx).replace(/[，,]\s*$/, '').trim() : rest;
        const desc = descIdx > 0 ? rest.slice(descIdx) : '';
        options.push({ label: m[1] + '. ' + label, desc });
      } else if (!questionText) {
        questionText = line.replace(/\*\*/g, '').replace(/\*/g, '').trim();
      }
    }
    options.push({ label: '自行填写', desc: '输入你的答案' });
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

function QuestionCard({ questions, onSelectionChange, answersRef, customRef, batchId }: {
  questions: ParsedQuestion[];
  onSelectionChange?: (count: number) => void;
  answersRef?: React.MutableRefObject<Record<string, Record<number, { label: string; custom: string }>>>;
  customRef?: React.MutableRefObject<Record<string, Record<number, string>>>;
  batchId?: string;
}) {
  if (questions.length === 0 || !batchId) return null;
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
        const batch = { ...(answersRef.current[batchId] || {}) };
        delete batch[qIdx];
        answersRef.current = { ...answersRef.current, [batchId]: batch };
      }
    } else {
      const newCount = Object.keys({ ...selected, [qIdx]: optIdx }).length;
      setSelected(prev => ({ ...prev, [qIdx]: optIdx }));
      onSelectionChange?.(newCount);
      if (answersRef) {
        const batch = { ...(answersRef.current[batchId] || {}), [qIdx]: { label: optLabel, custom: customAnswers[qIdx] || '' } };
        answersRef.current = { ...answersRef.current, [batchId]: batch };
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
                              if (customRef) {
                                const batchCustoms = { ...(customRef.current[batchId] || {}), [i]: e.target.value };
                                customRef.current = { ...customRef.current, [batchId]: batchCustoms };
                              }
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
  const fileLoading = useStore((s) => s.fileLoading);
  const activeFileId = useStore((s) => s.activeFileId);
  const isLoading = fileLoading[activeFileId] ?? false;
  const apiKey = useStore((s) => s.apiKey);
  const lockAdvance = useStore((s) => s.lockAdvance);
  const confirmLockAdvance = useStore((s) => s.confirmLockAdvance);
  const cancelLockAdvance = useStore((s) => s.cancelLockAdvance);
  const retryPrompt = useStore((s) => s.retryPrompt);
  const clearRetryPrompt = useStore((s) => s.clearRetryPrompt);
  const retrySend = useStore((s) => s.retrySend);
  const clearMessages = useStore((s) => s.clearMessages);
  const files = useStore((s) => s.files);
  const upstreamSelection = useStore((s) => s.upstreamSelection);
  const setUpstreamSelection = useStore((s) => s.setUpstreamSelection);
  const pendingAttachments = useStore((s) => s.pendingAttachments);
  const setPendingAttachments = useStore((s) => s.setPendingAttachments);
  const [expandedMsgs, setExpandedMsgs] = useState<Set<string>>(new Set());
  const isComposing = useRef(false);
  const [questionCompleted, setQuestionCompleted] = useState(0);
  const selectedAnswers = useRef<Record<string, Record<number, { label: string; custom: string }>>>({});
  const customRef = useRef<Record<string, Record<number, string>>>({});
  const [inputExpanded, setInputExpanded] = useState(false);
  const [activeMode, setActiveMode] = useState<'submit' | 'reply' | 'change' | null>(null);
  const [changeMode, setChangeMode] = useState(false);
  const composerRef = useRef<HTMLDivElement>(null);
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; content: string; size: number }>>([]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setUploadedFiles(prev => [...prev, { name: file.name, content, size: file.size }]);
      };
      reader.readAsText(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Auto-scroll to latest message
  useEffect(() => {
    if (chatBodyRef.current) {
      const lastMsg = chatBodyRef.current.querySelector('.msg-user:last-child, .msg-assistant:last-child, .loading-msg:last-child');
      if (lastMsg) lastMsg.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [messages.length, isLoading]);

  // Compute all A docs except current, split by position
  const aGroup = files.find(f => f.id === 'group:a');
  const aChildren = aGroup?.children ?? [];
  const currentIdx = aChildren.findIndex(f => f.id === activeFileId);
  const allOtherAFiles = aChildren.filter(f => f.id !== activeFileId);
  const beforeFiles = currentIdx > 0 ? aChildren.slice(0, currentIdx) : [];
  const afterFiles = currentIdx >= 0 ? aChildren.slice(currentIdx + 1) : [];
  const effectiveSelection = upstreamSelection !== null
    ? upstreamSelection
    : beforeFiles.map(f => f.id);

  const toggleUpstream = (fileId: string) => {
    const next = effectiveSelection.includes(fileId)
      ? effectiveSelection.filter(id => id !== fileId)
      : [...effectiveSelection, fileId];
    // Only reset to null when selection matches the default (beforeFiles only)
    const defaults = beforeFiles.map(f => f.id);
    const matchesDefault = next.length === defaults.length && defaults.every(id => next.includes(id));
    setUpstreamSelection(matchesDefault ? null : next);
  };

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
    // Find current batch = last assistant message with questions
    let currentBatchId = '';
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') { currentBatchId = messages[i].id; break; }
    }
    if (!currentBatchId) return;
    const answers: Record<number, { label: string; custom: string }> = selectedAnswers.current[currentBatchId] || {};
    const customs = customRef.current[currentBatchId] || {};
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
    if (!text && uploadedFiles.length === 0) return;

    // Build message with files
    let message = text;
    if (uploadedFiles.length > 0) {
      const filesContent = uploadedFiles.map(f =>
        `[用户上传的文件：${f.name}]\n\n${f.content}`
      ).join('\n\n---\n\n');
      message = text ? `${text}\n\n${filesContent}` : filesContent;
      setPendingAttachments(uploadedFiles.map(f => ({ name: f.name, size: f.size })));
    } else {
      setPendingAttachments(undefined);
    }

    if (activeMode === 'reply') {
      const tagged = `【inputType=answer】\n` + message;
      setInputText(tagged);
      setTimeout(() => sendMessage(), 50);
    } else if (activeMode === 'change') {
      const tagged = `【inputType=change】\n` + message;
      setInputText(tagged);
      setTimeout(() => sendMessage(), 50);
    } else {
      const tagged = `【inputType=answer】\n` + message;
      setInputText(tagged);
      setTimeout(() => sendMessage(), 50);
    }
    setUploadedFiles([]);
  };

  const openMode = (mode: 'submit' | 'reply') => {
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

  // On mount: check for interrupted session (last message is user = no AI reply received)
  useEffect(() => {
    const msgs = useStore.getState().messages;
    if (msgs.length === 0) return;
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg.role === 'user') {
      // AI reply never arrived. Restore the user's input so they can resend.
      const text = lastMsg.content.replace(/【inputType=(?:answer|change)】\n/, '').replace(/【请在你的回复末尾输出.*?】\n\n/, '');
      setInputText(text);
    }
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
      <div className="chat-body" ref={chatBodyRef}>
        {messages.map((m) => {
            if (m.role === 'user') {
              const displayContent = m.content
                .replace(/【inputType=(?:answer|change)】\n/, '')
                .replace(/【请在你的回复末尾输出.*?】\n\n/, '')
                .replace(/\n*\[用户上传的文件：[\s\S]*$/, '').trim();
              return (
                <div key={m.id} className="msg-user">
                  <div className="msg-user-content">{displayContent}</div>
                  {m.attachments && m.attachments.length > 0 && (
                    <div className="msg-user-attachments">
                      {m.attachments.map((f, i) => (
                        <span key={i} className="msg-attachment">
                          <span className="attachment-name">{f.name}</span>
                          <span className="attachment-size">({(f.size / 1024).toFixed(1)} KB)</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            const { restContent, questions } = parseQuestions(m.content);
            return (
              <div key={m.id} className="msg-assistant">
                <div
                  className="msg-markdown"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(restContent) }}
                />
                <QuestionCard questions={questions} onSelectionChange={setQuestionCompleted} answersRef={selectedAnswers} customRef={customRef} batchId={m.id} />
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
        <div className="new-session-bar">
          <button className="btn new-session-btn" onClick={() => { useStore.getState().clearMessages(); }}>新开 Session</button>
        </div>
      </div>
      {lockAdvance && (
        <div className="lock-advance-bar">
          <span className="lock-advance-text">AI 建议锁定当前文档并进入下一阶段。是否继续？</span>
          <div className="lock-advance-actions">
            <button className="btn lock-advance-confirm" onClick={confirmLockAdvance}>确认</button>
            <button className="btn lock-advance-cancel" onClick={cancelLockAdvance}>取消</button>
          </div>
        </div>
      )}
      {retryPrompt && (
        <div className="lock-advance-bar">
          <span className="lock-advance-text">上一次请求失败，未收到回复。是否重试？</span>
          <div className="lock-advance-actions">
            <button className="btn lock-advance-confirm" onClick={retrySend}>重试</button>
            <button className="btn lock-advance-cancel" onClick={clearRetryPrompt}>取消</button>
          </div>
        </div>
      )}
      {(!hasQuestions || activeMode !== null || (hasQuestions && activeMode === null)) && (
        <div className="composer" ref={composerRef}>
          <div className={`input${isReadOnly ? ' readonly' : ''}`}>
            {allOtherAFiles.length > 0 && (
              <div className="context-sources-bar">
                <span className="context-sources-label">上下文来源</span>
                {[...beforeFiles, ...afterFiles].map(f => {
                  const isSelected = effectiveSelection.includes(f.id);
                  return (
                    <button
                      key={f.id}
                      className={`upstream-chip${isSelected ? ' active' : ''}`}
                      onClick={() => toggleUpstream(f.id)}
                    >
                      {f.name.replace('.md', '')}
                    </button>
                  );
                })}
              </div>
            )}
            {hasQuestions && activeMode === null ? (
              <div className="mode-panel mode-panel-actions">
                <div className="mode-panel-actions-row">
                  <button className="chat-submit-btn" disabled={isLoading} onClick={submitOptions}>提交选项</button>
                  <button className={`chat-submit-btn${activeMode === 'reply' ? ' active' : ''}`} disabled={isLoading} onClick={() => openMode('reply')}>输入回复</button>
                </div>
              </div>
            ) : (
              <div className={`mode-panel mode-panel-compose${inputExpanded ? ' expanded' : ''}`}>
                <div className="textarea-wrap">
                  <textarea
                    className="input-textarea"
                    style={{ minHeight: inputExpanded ? 280 : 0 }}
                    value={isReadOnly ? '' : inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onCompositionStart={() => { isComposing.current = true; }}
                    onCompositionEnd={handleCompositionEnd}
                    placeholder="请输入"
                    disabled={isReadOnly || isLoading}
                  />
                  <button className="expand-btn" onClick={() => setInputExpanded(!inputExpanded)} title={inputExpanded ? '收起' : '放大'}>
                    <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 8 Q6 4 10 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M2 4.5 Q6 0.5 10 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </button>
                </div>
                {uploadedFiles.length > 0 && (
                  <div className="uploaded-files">
                    {uploadedFiles.map((file, index) => (
                      <div key={index} className="uploaded-file">
                        <span className="file-name">{file.name}</span>
                        <span className="file-size">({(file.size / 1024).toFixed(1)} KB)</span>
                        <button className="remove-file" onClick={() => removeFile(index)}>×</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="footer">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".md,.txt"
                    style={{ display: 'none' }}
                    onChange={handleFileUpload}
                    multiple
                  />
                  <button className="btn" onClick={() => fileInputRef.current?.click()}>添加文件</button>
                  <button
                    className={`btn-correction${changeMode ? ' active' : ''}`}
                    onClick={() => setChangeMode(!changeMode)}
                  >
                    跨文档纠偏
                  </button>
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

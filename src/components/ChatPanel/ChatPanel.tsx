import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store';
import ParticleText from '../ParticleText/ParticleText';
import ShinyText from '../ShinyText/ShinyText';
import './ChatPanel.css';

import PrismaticBurst from '../PrismaticBurst/PrismaticBurst';
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
  
  // Initialize selected from answersRef if available
  const initialSelected: Record<number, number[]> = {};
  if (answersRef?.current[batchId]) {
    const batch = answersRef.current[batchId];
    for (const [idx, ans] of Object.entries(batch)) {
      const qIdx = Number(idx);
      // Restore selected indices from labels
      if (ans.label) {
        const labels = ans.label.split(', ');
        const indices: number[] = [];
        for (const label of labels) {
          const optIdx = questions[qIdx]?.options.findIndex(o => o.label === label);
          if (optIdx >= 0) indices.push(optIdx);
        }
        if (indices.length > 0) initialSelected[qIdx] = indices;
      }
    }
  }
  
  const [selected, setSelected] = useState<Record<number, number[]>>(initialSelected);
  const [customAnswers, setCustomAnswers] = useState<Record<number, string>>({});

  const updateSelection = (qIdx: number, optIdx: number, optLabel: string, isCustom: boolean) => {
    const current = selected[qIdx] || [];
    const isSelected = current.includes(optIdx);
    let nextSelection: number[];
    
    if (isSelected) {
      // Deselect this option
      nextSelection = current.filter(i => i !== optIdx);
    } else {
      // Select this option (add to array)
      nextSelection = [...current, optIdx];
    }
    
    const next = { ...selected };
    if (nextSelection.length === 0) {
      delete next[qIdx];
    } else {
      next[qIdx] = nextSelection;
    }
    setSelected(next);
    
    // Count questions with at least one selection
    const newCount = Object.keys(next).length;
    onSelectionChange?.(newCount);
    
    if (answersRef) {
      const batch = { ...(answersRef.current[batchId] || {}) };
      if (nextSelection.length === 0) {
        delete batch[qIdx];
      } else {
        // Collect all selected labels
        const labels = nextSelection.map(idx => questions[qIdx].options[idx]?.label || '');
        console.log('[MultiSelect] qIdx:', qIdx, 'nextSelection:', nextSelection, 'labels:', labels, 'questions.options:', questions[qIdx]?.options);
        batch[qIdx] = { label: labels.join(', '), custom: customAnswers[qIdx] || '' };
      }
      answersRef.current = { ...answersRef.current, [batchId]: batch };
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
                      className={`q-option${selected[i]?.includes(j) ? ' q-selected' : ''}${isSelfFill ? ' q-self-fill' : ''}`}
                      onClick={() => {
                        updateSelection(i, j, o.label, isSelfFill);
                        if (!isSelfFill) {
                          setCustomAnswers(prev => { const n = {...prev}; delete n[i]; return n; });
                        }
                      }}
                    >
                      <span className={`q-radio${selected[i]?.includes(j) ? ' q-checked' : ''}`} />
                      <div className="q-opt-body">
                        <span className="q-opt-label">{o.label}</span>
                        {isSelfFill && selected[i]?.includes(j) && (
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
  const theme = useStore((s) => s.theme);
  const accent = useStore((s) => s.accent);
  const streamingMsgId = useStore((s) => s.streamingMsgId);
  const thinkingPhases = useStore((s) => s.thinkingPhases);
  const streamingMsg = streamingMsgId ? messages.find(m => m.id === streamingMsgId) : null;
  const inputText = useStore((s) => s.inputText);
  const setInputText = useStore((s) => s.setInputText);
  const sendMessage = useStore((s) => s.sendMessage);
  const fileLoading = useStore((s) => s.fileLoading);
  const activeFileId = useStore((s) => s.activeFileId);
  const isAnyLoading = Object.values(fileLoading).some(Boolean);
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
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set());
  const isComposing = useRef(false);
  const [questionCompleted, setQuestionCompleted] = useState(0);
  const selectedAnswers = useRef<Record<string, Record<number, { label: string; custom: string }>>>({});
  const customRef = useRef<Record<string, Record<number, string>>>({});
  const [inputExpanded, setInputExpanded] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);

  const [thinkingTime, setThinkingTime] = useState(0);
  const thinkingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const thinkingStartRef = useRef<number>(0);

  const [activeMode, setActiveMode] = useState<'submit' | 'reply' | 'change' | null>(null);
  const [changeMode, setChangeMode] = useState(false);
  const composerRef = useRef<HTMLDivElement>(null);
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
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const isWelcomeOnly = messages.length === 1 && messages[0].id === 'm1' && messages[0].role === 'assistant' && !messages[0].content.includes('【inputType');
  const userScrolledRef = useRef(false);
  const reasoningBodyRef = useRef<HTMLPreElement>(null);
  const reasoningScrolledRef = useRef(false);

  // Detect user manual scroll
  const isAutoScrollingRef = useRef(false);
  const isThinkingActiveRef = useRef(false);
  // Block scroll handler during thinking to prevent DOM changes from disabling auto-scroll
  useEffect(() => {
    isThinkingActiveRef.current = isLoading;
  }, [isLoading]);
  useEffect(() => {
    const el = chatBodyRef.current;
    if (!el) return;
    const onScroll = () => {
        if (isThinkingActiveRef.current) return;
        if (isAutoScrollingRef.current) return;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      userScrolledRef.current = !atBottom;
      if (atBottom) userScrolledRef.current = false; // Re-enable auto-scroll when back at bottom
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);


  // Auto-scroll reasoning block when expanded/collapsed (dont force chat body)
  useEffect(() => {
    requestAnimationFrame(() => {
      const el = reasoningBodyRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [expandedThinking]);

  // Auto-collapse completed phases immediately (no debounce)
  // A phase is "complete" when it has thinkingTime set by store.ts
  useEffect(() => {
    thinkingPhases.forEach((phase, idx) => {
      if (phase.thinkingTime !== undefined) {
        setExpandedThinking(prev => {
          const key = "thinking-" + idx;
          if (!prev.has(key)) return prev;
          const n = new Set(prev);
          n.delete(key);
          return n;
        });
      }
    });
  }, [thinkingPhases]);

  // Auto-scroll reasoning block during streaming (respects manual scroll within reasoning)
  useEffect(() => {
    const el = reasoningBodyRef.current;
    if (el && !reasoningScrolledRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [thinkingPhases]);
  // Reset reasoning scroll state when new phase is added
  useEffect(() => {
    reasoningScrolledRef.current = false;
    const el = reasoningBodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thinkingPhases.length]);

  // Listen for alittlebit-scroll events from store streaming callbacks
  // Respects user scroll — only auto-scrolls when user is at/near bottom
  useEffect(() => {
    const onScroll = () => {
      if (isThinkingActiveRef.current) return; // During thinking, don't force scroll
      if (userScrolledRef.current) return; // User scrolled away, don't force
      const el = reasoningBodyRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    };
    window.addEventListener('alittlebit-scroll', onScroll);
    return () => window.removeEventListener('alittlebit-scroll', onScroll);
  }, []);

  // Expand new phase when added (dont collapse others)
  const prevPhaseCountRef = useRef(0);
  useEffect(() => {
    if (thinkingPhases.length > prevPhaseCountRef.current) {
      const lastKey = "thinking-" + (thinkingPhases.length - 1);
      setExpandedThinking(prev => new Set(prev).add(lastKey));
    }
    prevPhaseCountRef.current = thinkingPhases.length;
  }, [thinkingPhases.length]);

  // Thinking timer - use Date for accurate time, uses isAnyLoading to persist across document switches
  // Timer runs while any document is loading. Phase thinkingTime is stored on completion and takes over display.
  useEffect(() => {
    if (isAnyLoading && !thinkingTimerRef.current) {
      thinkingStartRef.current = Date.now();
      thinkingTimerRef.current = setInterval(() => {
        setThinkingTime(Math.floor((Date.now() - thinkingStartRef.current) / 1000));
      }, 1000);
    } else if (!isAnyLoading && thinkingTimerRef.current) {
      clearInterval(thinkingTimerRef.current);
      thinkingTimerRef.current = null;
    }
    return () => {
      if (thinkingTimerRef.current) {
        clearInterval(thinkingTimerRef.current);
      }
    };
  }, [isAnyLoading]);



  // Compute all A docs except current, split by position
  const aGroup = files.find(f => f.id === 'group:a');
  const aChildren = aGroup?.children ?? [];
  // Group feature files into a single "Features" entry
  const featureFiles = aChildren.filter(f => f.name.startsWith('feature-'));
  const nonFeatureFiles = aChildren.filter(f => !f.name.startsWith('feature-'));
  const hasMultipleFeatures = featureFiles.length > 1;

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
    setThinkingTime(0);
    if (thinkingTimerRef.current) { clearInterval(thinkingTimerRef.current); thinkingTimerRef.current = null; }
    userScrolledRef.current = false;
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
    <div className="chat" style={{ position: 'relative' }}>
      {isLoading && (
        <PrismaticBurst
          intensity={theme === 'dark' ? 3 : 8}
          speed={2}
          animationType="rotate3d"
          colors={theme === 'dark' ? ['#000000', accent, accent] : ['#333333', accent, accent]}
          distort={0}
          rayCount={0}
          className="chat-prismatic-burst"
        />
      )}
      <div className="chat-body" ref={chatBodyRef}>
        {isWelcomeOnly && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', zIndex: 1 }}>
            <ParticleText
              key={sessionKey}
              text="请输入你的想法或目标"
              particleSize={1.5}
              density={3}
              color={theme === 'dark' ? '#ffffff' : '#000000'}
              highlightColor={accent}
              scatter={500}
              gatherDuration={1000}
              stagger={300}
              pointerRepel={30}
              repelRadius={220}
              idleDrift={1}
              trigger="mount"
              fontSize="clamp(1.8rem, 7vw, 4.5rem)"
              fontWeight={300}
              fontFamily="inherit"
              glow
              style={{ width: '100%', height: '100%' }}
            />
          </div>
        )}
        {!isWelcomeOnly && messages.filter((m: any) => !(m.id === 'm1' && m.content.includes('请输入你的想法或目标'))).map((m: any, mi: number, arr: any[]) => {
          const filtered = arr;
          const isLastUser = m.role === "user" && (mi === filtered.length - 1 || filtered[mi + 1]?.role !== "user");
          const parts = [];
          if (m.role === "user") {
            const displayContent = m.content
              .replace(/【inputType=(?:answer|change)】\n/, "")
              .replace(/【请在你的回复末尾输出.*?】\n\n/, "")
              .replace(/\n*\[用户上传的文件：[\s\S]*$/, "").trim();
            parts.push(
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
            if (isLastUser && thinkingPhases.length > 0) {
              parts.push(
                <div key="thinking-area" className="thinking-area">
                  {thinkingPhases.map((phase, pi) => {
                    const phaseKey = "thinking-" + pi;
                    return (
                      <div key={phaseKey} className="loading-msg">
                        <div className="thinking-toggle" onClick={() => setExpandedThinking(prev => { const n = new Set(prev); n.has(phaseKey) ? n.delete(phaseKey) : n.add(phaseKey); return n; })}>
                          <em>
                            {phase.label.includes('中') ? (
                              <ShinyText
                                text={phase.label + (phase.thinkingTime !== undefined ? " " + phase.thinkingTime + "s" : phase.startTime ? " " + Math.floor((Date.now() - phase.startTime) / 1000) + "s" : " " + thinkingTime + "s")}
                                speed={2}
                                delay={0}
                                color={theme === 'dark' ? '#ffffff' : '#000000'}
                                shineColor={accent}
                                spread={60}
                                direction="left"
                              />
                            ) : (
                              <>{phase.label}{phase.thinkingTime !== undefined ? " " + phase.thinkingTime + "s" : phase.startTime ? " " + Math.floor((Date.now() - phase.startTime) / 1000) + "s" : " " + thinkingTime + "s"}</>
                            )}
                          </em>{phase.reasoning ? <span className="thinking-arrow">{expandedThinking.has(phaseKey) ? "▲" : "▼"}</span> : null}
                        </div>
                        {expandedThinking.has(phaseKey) && phase.reasoning && (
                          <pre className="reasoning-block" ref={pi === thinkingPhases.length - 1 ? reasoningBodyRef : undefined} onScroll={(e) => {
                            const el = e.currentTarget;
                            const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
                            reasoningScrolledRef.current = !atBottom;
                          }}>{phase.reasoning}</pre>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            }
            return parts;
          }
          const { restContent, questions } = parseQuestions(m.content);
          return (
            <div key={m.id} className="msg-assistant">
              <div className="msg-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(restContent) }} />
              <QuestionCard questions={questions} onSelectionChange={setQuestionCompleted} answersRef={selectedAnswers} customRef={customRef} batchId={m.id} />
              {m.questionGenMeta?.attempted && (
                <div className="qg-meta">
                  {m.questionGenMeta.fillCount > 0 ? `已补缺 ${m.questionGenMeta.fillCount} 个` : ""}
                  {m.questionGenMeta.retryCount > 0 ? `${m.questionGenMeta.fillCount > 0 ? " · " : ""}已重试 ${m.questionGenMeta.retryCount} 次` : ""}
                  {m.questionGenMeta.finalStatus === "failed" ? `${m.questionGenMeta.attempted ? " · " : ""}最终未达标` : ""}
                  {m.questionGenMeta.warnings ? ` (${m.questionGenMeta.warnings})` : ""}
                </div>
              )}
              {m.protocol && (
                <div className="debug-toggle" onClick={() => toggleMsg(m.id)}>
                  {expandedMsgs.has(m.id) ? "▾" : "▸"} 协议详情
                </div>
              )}
              {expandedMsgs.has(m.id) && m.protocol && (
                <pre className="protocol-block">{JSON.stringify(m.protocol, null, 2)}</pre>
              )}
              {m.usage && (
                <div className="token-usage">
                  提示词 {m.usage.prompt.toLocaleString()} + 补全 {m.usage.completion.toLocaleString()} = {m.usage.total.toLocaleString()} token
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="floating-bars">
        <div className="new-session-bar">
          <button className="btn new-session-btn" onClick={() => { useStore.getState().clearMessages(); setSessionKey(k => k + 1); }}>新开 Session</button>
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
        {uploadedFiles.length > 0 && (
          <div className="uploaded-files-bar">
            {uploadedFiles.map((file, index) => (
              <div key={index} className="uploaded-file-item">
                <span className="file-name">{file.name}</span>
                <span className="file-size">({(file.size / 1024).toFixed(1)} KB)</span>
                <button className="remove-file" onClick={() => removeFile(index)}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>
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
                      className={`upstream-chip${isSelected ? ' active' : ''}${isLoading ? ' disabled' : ''}`}
                      onClick={() => !isLoading && toggleUpstream(f.id)}
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
                    className="input-textarea" disabled={isReadOnly || isLoading}
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
                    <svg width="12" height="12" viewBox="0 0 12 12"><path d="M1 11 L1 1 L11 1" fill="none" stroke="var(--accent-solid)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M4 8 L4 4 L8 4" fill="none" stroke="var(--accent-solid)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                </div>
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
                    className={`btn-correction${changeMode ? ' active' : ''}${isLoading ? ' disabled' : ''}`}
                    onClick={() => !isLoading && setChangeMode(!changeMode)}
                  >
                    跨文档纠偏
                  </button>
                  <button className="btn" onClick={doSend} disabled={isReadOnly || isLoading}>→</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

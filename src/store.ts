import { create } from 'zustand';
import type { VersionItem } from './data/versions';
import type { FileItem } from './data/files';
import type { EditorLine } from './data/editorLines';
import type { ChatMessage } from './data/messages';

const linesV1: EditorLine[] = [
  { id: 'v1L1', lineNumber: 1, text: '# AI 项目计划生成系统 v1.0', type: 'heading' },
  { id: 'v1L2', lineNumber: 2, text: '', type: 'paragraph' },
  { id: 'v1L3', lineNumber: 3, text: '> 初始草案版本。', type: 'quote' },
  { id: 'v1L4', lineNumber: 4, text: '## 目标', type: 'heading', active: true },
  { id: 'v1L5', lineNumber: 5, text: '将模糊想法转化为结构化文档。', type: 'paragraph' },
];
const versionContent: Record<string, EditorLine[]> = { v1: linesV1, v2: linesV1, v3: linesV1, v4: linesV1, v5: linesV1, v0_sample: linesV1 };

export type VersionStage = 'draft' | 'collecting' | 'refining' | 'confirmed' | 'locked' | 'derived';

export interface AppState {
  versions: VersionItem[];
  messages: ChatMessage[];
  activeVersionId: string;
  activeFileId: string;
  activeLineId: string;
  inputText: string;
  lines: EditorLine[];
  files: FileItem[];
  isReadOnly: boolean;
  apiKey: string;
  apiEndpoint: string;
  isLoading: boolean;
  questionCount: number;
  selectVersion: (id: string) => void;
  selectFile: (id: string) => void;
  selectLine: (id: string) => void;
  setInputText: (text: string) => void;
  sendMessage: () => Promise<void>;
  locklockVersion: (id: string) => void;
  renameVersion: (id: string, name: string) => void;
  createNextVersion: (id: string) => void;
  setFiles: (files: FileItem[]) => void;
  setEditorLines: (lines: EditorLine[]) => void;
  setApiKey: (key: string) => void;
  setApiEndpoint: (endpoint: string) => void;
  setQuestionCount: (n: number) => void;
  generateVersionFiles: (versionId: string) => Promise<void>;
  createFile: (name: string) => Promise<void>;
}

let msgCounter = 10;
let verCounter = 10;
const now = () => new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

function nextVersionName(title: string): string {
  const m = title.match(/^(.*)-(\d+)\.0$/);
  if (m) return m[1] + '-' + (parseInt(m[2]) + 1) + '.0';
  return title + '-2.0';
}

const SYSTEM_PROMPT = [
  '你是 AI 项目计划生成系统的工作流引擎。帮助用户将模糊想法逐步收敛为可执行的软件工程规范文档。',
  '',
  '## 输出格式要求（重要）',
  '你的回复将被渲染为 Markdown。请使用以下格式确保易读性：',
  '- 用 ## 和 ### 分隔不同章节',
  '- 用 **粗体** 标注关键术语和结论',
  '- 用 - 开头的无序列表组织要点',
  '- 用 1. 2. 3. 编号的问题列表',
  '- 每个章节之间留空行',
  '- 不要用长段落，每段不超过 3 行',
  '',
  '## 行为规则',
  '1. 收到输入后先判断输入类型：全新想法 / 已有版本补充',
  '2. 识别信息缺口（目标？边界？约束？技术？）',
  '3. 提问遵循从宽到窄：目标→场景→功能→约束→细节',
  '4. 优先用**选项形式**提问（给 A/B/C 让用户选）',
  '5. 用户回答后给出阶段性总结，明确标注「已确认」「推断」「待定」',
  '6. 信息足够时主动建议进入 refining 阶段',
  '7. 用户要求停止时立即进入冻结流程',
  '8. 中文回复，简洁、结构化、可扫读',
  '',
  '## 绝对不能做的事',
  '- 不能假装确认不完整信息',
  '- 不能替用户做决策',
  '- 不能跳过追问直接生成完整文档',
  '',
  '## 输出模板',
  '### 缺口分析',
  '<简要列出 1-3 个关键不确定点>',
  '',
  '### 本轮问题',
  '1. **问题一**（选项 A / 选项 B / 选项 C）',
  '2. **问题二**（选项 A / 选项 B）',
  '3. **问题三**',
  '',
  '### 当前理解',
  '- **已确认**: <列表>',
  '- **推断**: <列表>',
  '- **待定**: <列表>',
  '',
  '### 下一步',
  '<继续追问 / 进入 refining / 建议确认>',
  '',
  '【阶段识别】: <draft|collecting|refining|confirmed>',
].join('\n');

function buildPrompt(versions: any[], activeId: string, questionCount: number): string {
  const v = versions.find((x: any) => x.id === activeId);
  const stage = v?.stage ?? 'draft';
  let ctx = '【重要指令】本次你必须且只能提出 ' + questionCount + ' 个问题。\n\n' + SYSTEM_PROMPT;
  if (stage === 'collecting') ctx += '\n\n当前阶段: 收集中。请围绕缺口继续追问。';
  if (stage === 'refining') ctx += '\n\n当前阶段: 精进中。方向已明确。';
  if (stage === 'confirmed') ctx += '\n\n当前阶段: 已确认。可要求 locklock 锁定。';
  return ctx;
}

function parseStage(reply: string): VersionStage | null {
  const m = reply.match(/【阶段识别】[：:]\s*(draft|collecting|refining|confirmed)/i);
  return m ? (m[1].toLowerCase() as VersionStage) : null;
}

async function callAI(apiKey: string, endpoint: string, msgs: ChatMessage[], versions: any[], activeId: string, questionCount: number): Promise<string> {
  const systemMsg = { role: 'system', content: buildPrompt(versions, activeId, questionCount) };
  const chatMsgs = msgs.map((m) => ({ role: m.role as string, content: m.content }));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({ model: 'deepseek-chat', messages: [systemMsg, ...chatMsgs], temperature: 0.7, max_tokens: 2048 }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) { const err = await res.text(); throw new Error('API error ' + res.status + ': ' + err); }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  } finally {
    clearTimeout(timer);
  }
}

export const useStore = create<AppState>((set, get) => ({
  versions: [
    { id: 'v0_sample', title: 'v0_sample', locked: false, active: true },
  ] as any,
  messages: [
    { id: 'm1', role: 'assistant' as const, content: '欢迎使用 AI 项目计划生成系统。请输入你的想法或目标，我来帮你逐步收敛为可执行的计划。', timestamp: '10:00' },
  ],
  activeVersionId: 'v0_sample',
  activeFileId: 'f1',
  activeLineId: 'L08',
  inputText: '',
  lines: linesV1,
  files: [],
  isReadOnly: false,
  apiKey: '',
  apiEndpoint: 'https://api.deepseek.com/v1/chat/completions',
  isLoading: false,
  questionCount: 3,

  selectVersion: (id) => {
    const versions = get().versions;
    const version = versions.find((v) => v.id === id) as any;
    const newLines = versionContent[id] ?? [{ id: 'empty', lineNumber: 1, text: '// 新版本', type: 'meta', active: true }];
    set({
      versions: versions.map((v) => ({ ...v, active: v.id === id })),
      activeVersionId: id,
      lines: newLines,
      activeLineId: newLines[0]?.id ?? '',
      isReadOnly: version?.locked ?? false,
    });
    // Load version-specific files
    fetch('/api/files?dir=letsgo/versions/' + id)
      .then((r) => r.json())
      .then((data: any[]) => {
        const files = data.map((f: any) => ({
          id: f.id,
          name: f.name,
          type: f.type as any,
        }));
        set({ files, activeFileId: files[0]?.id ?? '' });
      })
      .catch(() => {});
  },

  selectFile: (id) => {
    const file = get().files.find((f) => f.id === id);
    if (!file) return;
    set({ activeFileId: id });
    if (file.type === 'folder') return;
    fetch('/api/files?path=' + encodeURIComponent('letsgo/versions/' + get().activeVersionId + '/' + file.name))
      .then((r) => r.json())
      .then((data) => {
        if (data.lines) {
          const lines = data.lines.map((l: any, i: number) => ({ ...l, active: i === 0 }));
          set({ lines, activeLineId: lines[0]?.id ?? '' });
        }
      })
      .catch(() => {});
  },

  selectLine: (id) => set((s) => ({
    lines: s.lines.map((l) => ({ ...l, active: l.id === id })),
    activeLineId: id,
  })),

  setInputText: (text) => set({ inputText: text }),

  sendMessage: async () => {
    const { inputText, isReadOnly, apiKey, isLoading } = get();
    const text = inputText.trim();
    if (!text || isReadOnly || isLoading) return;
    if (!apiKey) {
      set({
        messages: [...get().messages, { id: 'm' + (msgCounter++), role: 'assistant' as const, content: '请先在设置中配置 API Key。', timestamp: '' }],
        inputText: '',
      });
      return;
    }
    const userMsg: ChatMessage = { id: 'm' + (msgCounter++), role: 'user', content: text, timestamp: now() };
    set((s) => ({ messages: [...s.messages, userMsg], inputText: '', isLoading: true }));

    try {
      const reply = await callAI(apiKey, get().apiEndpoint, [...get().messages], get().versions, get().activeVersionId, get().questionCount);
      const parsedStage = parseStage(reply);
      const newMsgs = [...get().messages, { id: 'm' + (msgCounter++), role: 'assistant' as const, content: reply, timestamp: now() }];
      const updates: any = { messages: newMsgs, isLoading: false };
      if (parsedStage) {
        updates.versions = get().versions.map((v) => {
          if (v.id === get().activeVersionId) return { ...v, stage: parsedStage } as any;
          return v;
        });
      }
      set(updates);
    } catch (e: any) {
      set((s) => ({
        messages: [...s.messages, { id: 'm' + (msgCounter++), role: 'assistant' as const, content: 'API 调用失败: ' + e.message, timestamp: now() }],
        isLoading: false,
      }));
    }
  },

  locklockVersion: async (id) => {
    const versions = get().versions;
    const v = versions.find((x) => x.id === id) as any;
    if (!v) return;
    // Toggle unlock
    if (v.locked) {
      set({
        versions: versions.map((x) => x.id === id ? { ...x, locked: false, stage: 'confirmed' } as any : x),
        isReadOnly: get().activeVersionId === id ? false : get().isReadOnly,
        messages: [...get().messages, { id: 'm' + (msgCounter++), role: 'assistant' as const, content: '版本 ' + v.title + ' 已解锁。', timestamp: now() }],
      });
      return;
    }
    // Lock flow
    try {
      const res = await fetch('/api/files/locklock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: id }),
      });
      const data = await res.json();
      if (!data.ok) {
        set((s) => ({
          messages: [...s.messages, { id: 'm' + (msgCounter++), role: 'assistant' as const, content: 'locklock 失败: ' + (data.error || '未知错误'), timestamp: now() }],
        }));
        return;
      }
      set({
        versions: versions.map((x) => x.id === id ? { ...x, locked: true, stage: 'locked' } as any : x),
        isReadOnly: get().activeVersionId === id ? true : get().isReadOnly,
        messages: [...get().messages, { id: 'm' + (msgCounter++), role: 'assistant' as const, content: '版本 ' + v.title + ' 已 locklock。硬门槛检查通过，已归档至 letsgo/archive/' + id + '/', timestamp: now() }],
      });
    } catch {
      set((s) => ({
        messages: [...s.messages, { id: 'm' + (msgCounter++), role: 'assistant' as const, content: 'locklock 失败: 无法连接服务器', timestamp: now() }],
      }));
    }
  },

  renameVersion: (id, name) => set((s) => ({
    versions: s.versions.map((v) => (v.id === id ? { ...v, title: name } : v)),
  })),

  createNextVersion: async (id) => {
    const versions = get().versions;
    const parent = versions.find((v) => v.id === id) as any;
    if (!parent) return;
    const newId = 'v' + (verCounter++);
    const newVersion: any = { id: newId, title: nextVersionName(parent.title), locked: false, active: false, stage: 'draft' };
    const idx = versions.findIndex((v) => v.id === id);
    const newVersions = [...versions.slice(0, idx + 1), newVersion, ...versions.slice(idx + 1)] as any;
    versionContent[newId] = (versionContent[id] ?? []).map((l) => ({ ...l, active: false }));
    set({ versions: newVersions });
    // Copy parent version files
    try {
      await fetch('/api/versions/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromVersion: id, toVersion: newId }),
      });
    } catch {}
    get().selectVersion(newId);
  },

  setFiles: (files) => set({ files }),
  setEditorLines: (lines) => set({ lines }),
  setApiKey: (key) => set({ apiKey: key }),
  setApiEndpoint: (endpoint) => set({ apiEndpoint: endpoint }),
  setQuestionCount: (n) => set({ questionCount: n }),

  generateVersionFiles: async (versionId) => {
    const v = get().versions.find((x) => x.id === versionId) as any;
    if (!v) return;
    const body = JSON.stringify({
      versionId,
      title: v.title,
      messages: get().messages.map((m) => ({ role: m.role, content: m.content })),
      lines: get().lines.map((l) => ({ text: l.text })),
    });
    try {
      const res = await fetch('/api/files/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (!res.ok) throw new Error('生成失败');
      set((s) => ({
        messages: [...s.messages, { id: 'm' + (msgCounter++), role: 'assistant' as const, content: '版本 ' + v.title + ' 的文件已生成。', timestamp: now() }],
      }));
    } catch {
      set((s) => ({
        messages: [...s.messages, { id: 'm' + (msgCounter++), role: 'assistant' as const, content: '文件生成失败。', timestamp: now() }],
      }));
    }
  },

  createFile: async (name) => {
    const fullName = name.endsWith('.md') ? name : name + '.md';
    const dir = 'letsgo/versions/' + get().activeVersionId;
    try {
      const res = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: fullName, content: '# ' + fullName.replace('.md', '') + '\n\n', dir }),
      });
      if (!res.ok) { const err = await res.json(); alert(err.error || '创建失败'); return; }
      const data = await res.json();
      const newFile: FileItem = { id: data.name, name: data.name, type: data.type as FileItem['type'] };
      const currentFiles = get().files;
      const files = [...currentFiles, newFile];
      set({ files, activeFileId: data.name });
    } catch { alert('创建文件失败'); }
  },
}));

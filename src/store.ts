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
  temporaryActions: any[];
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
  toggleLight: (fileId: string) => void;
  setLight: (fileId: string, light: 'gray' | 'green' | 'yellow') => void;
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
  '你是 alittlebit 的文档收敛与版本治理工作流引擎。',
  '你的任务不是泛泛回答问题，而是按照固定的文档链路，把用户的模糊想法逐步收敛为可执行、可追溯、可验证、可锁定、可派生的软件工程文档体系。',
  '',
  '你必须始终遵守以下原则：',
  '1. 先收敛，再细化',
  '2. 先确认，再锁定',
  '3. 先保留，再优化',
  '4. 先落盘，再认为完成',
  '5. 先结构化，再美化',
  '6. 所有变化都必须可追溯',
  '7. 每个版本都必须保留',
  '8. 系统可以推断，但推断不能自动升级为确认',
  '9. 暂存内容不得自动升级为正式结论',
  '10. 锁定内容不得被当前对话直接改写',
  '11. 每个阶段都必须有明确产物',
  '12. 不允许跳过前置阶段直接进入下游阶段',
  '',
  '==================================================',
  '一、工作目标',
  '==================================================',
  '你的最终目标是把一个模糊项目想法，持续收敛为一条完整的软件工程文档链，并支持版本化管理。',
  'A 类核心产出文档包括：PRD / Features / Rules / RFC / Implementation / Code Review / Testing Strategy / Change Management',
  'B 类治理产出文档包括：version_summary.md / question_log.md / confirmation_log.md / change_log.md / freeze_summary.md / 差异文件 / 主入口索引',
  '你必须让 A 类文档和 B 类文档形成闭环。',
  '',
  '==================================================',
  '二、当前工作模式',
  '==================================================',
  '你必须先判断当前输入属于哪一种：全新想法 / 已有版本补充 / 已有版本修订 / 用户要求停止 / 用户要求锁定 / 用户要求继续推进',
  '然后再选择对应工作路径。你必须始终明确当前处于哪个阶段：understanding / collecting / refining / generating / syncing / locklock',
  '',
  '==================================================',
  '三、文档链顺序',
  '==================================================',
  '必须按以下顺序推进：PRD → Features → Rules → RFC → Implementation → Code Review → Testing Strategy → Change Management',
  '版本治理文档应同步生成或更新：version_summary / question_log / confirmation_log / change_log / freeze_summary / 差异文件 / 主入口索引',
  '你不得跳过前置文档直接生成后置文档。',
  '',
  '==================================================',
  '四、提问顺序',
  '==================================================',
  '你必须按"从宽到窄"的顺序提问，但必须结合当前文档阶段。默认提问顺序：目标 → 用户 → 场景 → 范围 → 边界 → 约束 → 功能 → 非功能需求 → 依赖 → 风险 → 验收标准 → 版本治理要求',
  '当当前阶段对应某一份文档时，你必须优先补全该文档的缺口字段，而不是泛泛追问。',
  'PRD 阶段优先补：背景、目标、范围、用户、场景、功能、非功能、成功指标',
  'Features 阶段优先补：功能编号、分类、优先级、验收标准、依赖、边界',
  'Rules 阶段优先补：技术栈、命名、目录、状态管理、API、测试、安全',
  'RFC 阶段优先补：方案、依赖、文件变更、接口、状态、错误处理、测试策略',
  'Implementation 阶段优先补：文件变更、实施顺序、风险、回滚',
  'Review 阶段优先补：问题、风险、规则偏差、验收对照',
  'Testing 阶段优先补：测试范围、重点场景、异常场景、回归项',
  'Change Management 阶段优先补：变更内容、影响、决策、同步项',
  '你每轮提问应保持克制，优先 3 到 5 个问题。',
  '',
  '==================================================',
  '五、灯状态规则',
  '==================================================',
  '只有 A 类核心产出文档需要灯。B / C / D 类治理文档不需要灯。',
  '灰色：当前文件未结束，允许继续追问',
  '黄色：系统判断接近完成，建议收口，但仍允许补问',
  '绿色：当前文件已结束，不再追问',
  '锁定：用户明确确认结束，自动逻辑不得再改回灰色',
  '灯状态优先级：1. 用户手动锁定状态  2. 用户手动当前状态  3. 系统自动判定状态',
  '用户点绿后，该文件默认进入锁定结束状态；用户点灰后，该文件恢复可追问状态。',
  '锁定状态下，不得继续追问该文件。若文件已锁定，只允许查看或基于它派生新版本。',
  '',
  '==================================================',
  '六、自动灯判定规则',
  '==================================================',
  '自动判定只在用户未手动指定状态时生效。',
  '自动变绿条件：必填字段已完成 + 关键章节已完成 + 无阻塞性待确认项 + 无占位符残留 + 达到当前类型最低完成标准',
  '自动变黄条件：主要内容已完成 + 仍有少量非阻塞性待确认项 + 已接近收口但不适合锁定',
  '自动变灰条件：必填字段或关键章节缺失 / 存在阻塞性待确认项 / 存在占位符残留 / 未达最低完成标准',
  '绿灯不是装饰，而是"不再追问"的信号；黄灯是"建议收口"的中间态；灰灯是"继续追问"的信号。',
  '',
  '==================================================',
  '七、文档完成规则',
  '==================================================',
  '文档不要求"所有位置都填满"，而要求：必填项完成 + 关键章节完成 + 无阻塞项 + 无未确认的核心缺口 + 达到当前文档类型的最低完成标准。',
  '以下内容出现时，视为未完成或未收口：{ ... } / TODO / TBD / 待确认 / 未定 / 暂存 / 未确认。如果出现在阻塞字段中，文档不能变绿。',
  '',
  '==================================================',
  '八、A 类文档必备要求',
  '==================================================',
  '所有 A 类文档都必须至少具备：文档标题 / 文档编号 / 版本号 / 状态 / 创建时间 / 来源 / 关联上游文档 / 负责人 / 验收标准 / 版本治理衔接',
  'A 类文档末尾必须增加"版本治理衔接"节：是否允许继续推进 / 是否有未确认项 / 是否有暂存项 / 是否已生成确认记录 / 是否已同步差异文件 / 是否已更新索引 / 是否已生成版本摘要 / 是否已进入锁定状态',
  '',
  '==================================================',
  '九、输出格式要求',
  '==================================================',
  '你的每轮输出必须尽量包含以下部分：',
  '### 当前理解',
  '- 已确认 / 推断 / 待定',
  '',
  '### 缺口分析',
  '- 关键缺口 1-3 个',
  '',
  '### 状态判断',
  '- 当前阶段 / 当前文档状态 / 当前灯状态 / 是否允许继续追问 / 是否建议收口',
  '',
  '### 下一步',
  '- 继续追问 / 进入下一阶段 / 建议锁定 / 建议派生新版本',
  '',
  '### 本轮问题',
  '{QUESTION_LIST}',
  '',
  '## 硬性格式约束',
  '- 以上 5 个段落（当前理解/缺口分析/状态判断/下一步/本轮问题）必须全部出现',
  '- 每个段落必须以 ### 开头，不得省略 #',
  '- 不按此格式输出视为违规',
  '你必须尽量避免长篇散文式回答，优先结构化输出。',
  '',
  '==================================================',
  '十、语义路由规则（乱序输入，有序处理）',
  '==================================================',
  '用户可以乱序表达、天马行空。系统必须按语义分发，同一句话可命中多个文档。',
  '总原则：当前激活文档优先 / 已锁定文档不直接改写 / 不确定内容先暂存 / 文档链按 PRD→Features→Rules→RFC→Implementation→Review→Testing→Change 顺序推进',
  '',
  '## 语义路由表',
  '- 项目背景、为什么做、痛点 → PRD + version_summary',
  '- 目标、成功标准 → PRD + Features',
  '- 目标用户、角色、画像 → PRD + Features',
  '- 使用场景、用户旅程 → PRD + Features',
  '- 范围、本期做什么/不做什么 → PRD + RFC',
  '- 功能点、功能名、能力清单 → Features + PRD',
  '- 功能优先级 Must/Should/Could → Features + RFC',
  '- 功能验收标准 → Features + RFC',
  '- 功能依赖关系 → Features + RFC',
  '- 技术栈、版本选择 → Rules + RFC',
  '- 命名规范、目录结构、文件组织 → Rules + Implementation',
  '- 状态管理、数据流、组件边界 → Rules + RFC',
  '- API 规范、错误处理、重试、超时 → Rules + RFC',
  '- 安全要求、权限边界、API Key 处理 → Rules + PRD',
  '- 性能、可访问性、响应式要求 → Rules + PRD',
  '- 不允许项、禁止项、约束规则 → Rules + SYSTEM_PROMPT',
  '- 具体实现方案、拆分步骤 → RFC + Implementation',
  '- 文件改动清单 → RFC + Implementation',
  '- 接口请求/返回结构 → RFC + Rules',
  '- 数据模型、字段定义、状态流转 → RFC + Rules',
  '- 复杂度评估 → RFC + Features',
  '- 风险、取舍、替代方案 → RFC + Implementation',
  '- 实际开发过程、改动过程 → Implementation + change_log',
  '- 自检结果、完成情况 → Implementation + Code Review',
  '- 代码问题、审查结论、风险项 → Code Review + RFC',
  '- 测试范围、测试类型、测试用例 → Testing Strategy + RFC',
  '- 异常场景、边界场景、回归范围 → Testing Strategy + RFC',
  '- 需求变更、新增/修改/删除 → Change Management + change_log',
  '- 版本切换、派生新版本、锁定 → B 类治理 + latest_plan + version_summary',
  '- 问过什么、回答了什么 → question_log + confirmation_log',
  '- 哪些内容已确认 → confirmation_log + version_summary',
  '- 当前版本状态、是否能继续 → latest_plan + version_summary',
  '- 差异、对比、变更摘要 → change_log/diff + version_summary',
  '- 文件是否结束、是否锁定 → 灯状态 + latest_plan + version_summary',
  '',
  '## 一句话多义时优先级：当前激活文档 > 当前阶段文档 > 上游文档 > Rules > 版本治理文档 > 暂存区',
  '',
  '==================================================',
  '十一、乱序输入处理流程',
  '==================================================',
  '1. 识别：判断输入中包含几个语义块',
  '2. 拆分：将复合输入拆成多个候选信息单元',
  '3. 归类：将每个单元按路由表路由到对应文档或暂存区',
  '4. 判断状态：目标文档是灰/黄/绿/锁定',
  '5. 执行：灰灯可写入+追问 / 黄灯建议收口 / 绿灯不写只读 / 锁定只读需派生',
  '',
  '==================================================',
  '十二、暂存与冲突规则',
  '==================================================',
  '以下情况必须暂存：归类不明确 / 依赖未满足 / 与当前阶段不一致 / 与锁定内容冲突 / 用户表达不足以定稿',
  '暂存内容不得直接定稿，只能在后续追问确认后写入。暂存项可跨文档存在但不重复定稿。',
  '冲突优先级：已锁定内容 > 当前激活文档 > 当前阶段 > 上游文档 > 暂存候选项',
  '若仍无法判断，先追问，不得猜测定稿。',
  '',
  '==================================================',
  '十三、结构化输出协议（必须严格遵守）',
  '==================================================',
  '每轮回复末尾必须输出一段 JSON 协议块，用 ```json 和 ``` 包裹。前端将解析此 JSON 执行切文件、改灯、锁定等操作。',
  '协议字段：',
  '{',
  '  "currentDocument": { "type": "文档类型", "file": "文件名", "status": "gray/yellow/green" },',
  '  "documentChain": [',
  '    { "type": "PRD", "file": "prd.md", "status": "gray", "locked": false },',
  '    ...',
  '  ],',
  '  "shouldAdvance": false,',
  '  "suggestedNextDocument": null,',
  '  "writeActions": [',
  '    { "target": "PRD", "section": "8. 非功能需求", "content": "建议写入的内容" }',
  '  ],',
  '  "temporaryActions": [',
  '    { "target": "Features", "section": "F-003", "content": "暂存内容", "reason": "暂存原因" }',
  '  ],',
  '  "questions": ["问题1", "问题2", "问题3"],',
  '  "confirmations": ["本轮已确认内容1", "本轮已确认内容2"],',
  '  "uiActions": {',
  '    "selectFile": null,',
  '    "setLight": null,',
  '    "lockCurrentDocument": false',
  '  }',
  '}',
  '重要规则：',
  '- shouldAdvance 为 true 时，必须同时设置 suggestedNextDocument 和 uiActions.selectFile',
  '- setLight 为 green 时，必须同时设置 lockCurrentDocument = true',
  '- 不确定内容走 temporaryActions，不得进 writeActions',
  '- 当前文档灰灯时 shouldAdvance 必须为 false',
  '- questions 最多 5 个',
  '- JSON 必须合法可解析，不得有注释或尾部逗号',
  '',
  '【阶段识别】: <draft|collecting|refining|confirmed>',
].join('\n');

function buildPrompt(versions: any[], activeId: string, questionCount: number, files: FileItem[], activeFileId: string, snapshot: string): string {
  const v = versions.find((x: any) => x.id === activeId);
  const stage = v?.stage ?? 'draft';

  // Dynamically generate the question list based on questionCount
  let questionList = '';
  for (let i = 1; i <= questionCount; i++) {
    if (i > 1) questionList += '\n';
    questionList += i + '. **问题' + i + '**\n';
    questionList += '  - A：...\n';
    questionList += '  - B：...\n';
    questionList += '  - C：...';
  }

  // Build document chain context
  const docChain = ['PRD','Features','Rules','RFC','Implementation','Code Review','Testing Strategy','Change Management'];
  const aGroup = files.find(f => f.id === 'group:a');
  const aChildren = aGroup?.children ?? [];
  const activeFile = (() => {
    for (const f of files) {
      if (f.id === activeFileId) return f;
      if (f.children) { const found = f.children.find(c => c.id === activeFileId); if (found) return found; }
    }
    return null;
  })();
  const currentDocType = activeFile?.category === 'a' ? activeFile.name : null;

  // Determine current mode
  let mode = 'fill_current_doc';
  if (currentDocType && activeFile?.light === 'yellow') mode = 'suggest_complete';
  if (currentDocType && activeFile?.light === 'green') mode = 'locked';

  // Build chain progress table
  let chainStatus = '';
  for (let i = 0; i < docChain.length; i++) {
    const child = aChildren[i];
    const light = child?.light ?? 'gray';
    const marker = child?.name === currentDocType ? ' ← 当前' : '';
    chainStatus += '- ' + docChain[i] + '：' + (light === 'green' ? '绿' : light === 'yellow' ? '黄' : '灰') + marker + '\n';
  }

  const context = [
    '',
    '==================================================',
    '【运行时上下文 — 必须遵守】',
    '==================================================',
    '当前激活文档：' + (currentDocType ? currentDocType + ' (' + (activeFile?.light ?? 'gray') + '灯)' : '无（未选择 A 类文档）'),
    '当前提问模式：' + mode,
    '',
    '文档链进度：',
    chainStatus.trim(),
    '',
    '本轮规则：',
    '- 灰灯：继续追问当前文档，补全缺口',
    '- 黄灯：建议收口，但仍可补问',
    '- 绿灯/锁定：当前文档结束，不得追问',
    '- 当前文档未完成（灰/黄），不得跳到下一个文档',
    '- 当前文档完成后，自动进入下一个文档',
    '- 不输出未激活文档的内容',
    '',
  ].join('\n');

  let ctx = '【硬性指令】你必须且只能提出**恰好 ' + questionCount + ' 个**问题。不满 ' + questionCount + ' 个或多于 ' + questionCount + ' 个均为错误。\n\n' + SYSTEM_PROMPT.replace('{QUESTION_LIST}', questionList) + context;
  if (stage === 'collecting') ctx += '\n\n当前阶段: 收集中。请围绕缺口继续追问。';
  if (stage === 'refining') ctx += '\n\n当前阶段: 精进中。方向已明确。';
  if (stage === 'confirmed') ctx += '\\n\\n当前阶段: 已确认。可要求 locklock 锁定。';
  if (snapshot) ctx += '\\n\\n【当前文件内容快照】\\n```\\n' + snapshot + '\\n```';
  return ctx;
}

function parseStage(reply: string): VersionStage | null {
  const m = reply.match(/【阶段识别】[：:]\s*(draft|collecting|refining|confirmed)/i);
  return m ? (m[1].toLowerCase() as VersionStage) : null;
}

function extractProtocol(reply: string): any | null {
  const m = reply.match(/```json\s*\n([\\s\S]*?)\n```/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

function executeProtocol(store: any, protocol: any) {
  const { uiActions, writeActions } = protocol;

  // 0. Apply write actions (write AI suggestions to disk)
  if (writeActions && writeActions.length > 0) {
    const currentContent = store.lines.map((l: any) => l.text).join('\n');
    applyWriteActions(writeActions, store.activeVersionId, currentContent).then((newContent) => {
      if (newContent !== currentContent) {
        const lines = newContent.split('\n').map((text: string, i: number) => ({
          id: 'wL' + (i + 1), lineNumber: i + 1, text,
          type: text.startsWith('#') ? 'heading' : text.startsWith('-') ? 'list' : text.startsWith('>') ? 'quote' : 'paragraph',
        }));
        store.setEditorLines(lines);
        // Sync B artifacts
        const firstAction = writeActions[0];
        syncBAfterWrite(firstAction.targetFile, firstAction.content, protocol.questions ?? [], protocol.confirmations ?? [], store.activeVersionId);
      }
    });
  }

  if (!uiActions) return;

  // 1. Switch file
  if (uiActions.selectFile) {
    const fileId = findFileId(store.files, uiActions.selectFile);
    if (fileId) store.selectFile(fileId);
  }

  // 2. Set light
  if (uiActions.setLight) {
    const activeId = store.activeFileId;
    if (activeId) store.setLight(activeId, uiActions.setLight);
  }

  // 3. Lock current document
  if (uiActions.lockCurrentDocument) {
    store.locklockVersion(store.activeVersionId);
  }

  // 4. Advance to next document
  if (protocol.shouldAdvance && protocol.suggestedNextDocument) {
    const nextFileId = findFileId(store.files, protocol.suggestedNextDocument);
    if (nextFileId) store.selectFile(nextFileId);
  }
}

function findFileId(files: FileItem[], name: string): string | null {
  for (const f of files) {
    if (f.name === name) return f.id;
    if (f.children) {
      for (const c of f.children) {
        if (c.name === name) return c.id;
      }
    }
  }
  return null;
}

function getRequiredSections(docName: string): string[] {
  if (docName.includes('prd')) return ['背景与概述', '问题定义', '目标', '范围', '功能需求', '成功指标', '验收标准'];
  if (docName.includes('features')) return ['功能总览', '功能清单', '功能依赖图', '版本与范围说明', '验收标准'];
  if (docName.includes('rules')) return ['技术栈与版本', '架构约束', '命名规范', '状态管理规范', '测试规范', '不允许项', '完整性交付标准'];
  if (docName.includes('rfc') && !docName.includes('prd')) return ['目标', '范围', '背景与问题', '设计方案', '依赖关系', '验收标准', '测试策略'];
  if (docName.includes('implementation')) return ['实施目标', '变更计划', '关键实现说明', '自检结果'];
  if (docName.includes('code-review')) return ['审查结论', '问题清单', '风险分析', '验收对照'];
  if (docName.includes('testing')) return ['测试目标', '测试范围', '异常场景', '验收标准'];
  if (docName.includes('change-management')) return ['变更概述', '变更内容', '影响分析', '决策记录', '后续动作'];
  return [];
}

function evaluateLight(content: string, docName?: string): 'gray' | 'yellow' | 'green' {
  const hasPlaceholder = /{[^}]+}|TODO|TBD|待确认|未定|暂存|未确认/.test(content);
  const tooShort = content.trim().length < 50;
  if (hasPlaceholder || tooShort) return 'gray';
  const required = getRequiredSections(docName ?? '');
  const missing = required.filter(s => !content.includes(s));
  if (missing.length > 0) return 'yellow';
  return 'green';
}

async function applyWriteActions(actions: any[], activeVersionId: string, currentContent: string): Promise<string> {
  let content = currentContent;
  for (const a of actions) {
    if (!a.targetFile || !a.content) continue;
    const targetPath = 'letsgo/versions/' + activeVersionId + '/' + a.targetFile;
    try {
      // Read current content of target file
      const res = await fetch('/api/files?path=' + encodeURIComponent(targetPath));
      const data = await res.json();
      const current = data.lines ? data.lines.map((l: any) => l.text).join('\n') : '';
      // Apply append to section
      let next = current;
      if (a.operation === 'append' && a.targetSection) {
        const heading = a.targetSection.startsWith('##') ? a.targetSection : '## ' + a.targetSection;
        const idx = current.indexOf(heading);
        if (idx >= 0) {
          // Find end of section (next ## or end)
          let end = current.indexOf('\n## ', idx + heading.length);
          if (end < 0) end = current.length;
          next = current.slice(0, end) + '\n- ' + a.content + current.slice(end);
        } else {
          // Section not found, append at end
          next = current + '\n' + heading + '\n- ' + a.content;
        }
      } else {
        next = current + '\n- ' + a.content;
      }
      // Write back
      await fetch('/api/files/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: targetPath, content: next }),
      });
      if (a.targetFile === (activeVersionId ? '' : '')) content = next; // update if same file
    } catch (e) {
      console.warn('[applyWriteActions] failed for', a.targetFile, e);
    }
  }
  return content;
}

async function appendToBFile(fileName: string, entry: string, verId: string) {
  const bPath = 'letsgo/versions/' + verId + '/b/' + fileName;
  try {
    const res = await fetch('/api/files?path=' + encodeURIComponent(bPath));
    const data = await res.json();
    const current = data.lines ? data.lines.map((l: any) => l.text).join('\n') : '';
    const next = current + '\n' + entry;
    await fetch('/api/files/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: bPath, content: next }),
    });
  } catch (e) { console.warn('[syncB] failed:', fileName, e); }
}

async function syncBAfterWrite(targetFile: string, content: string, questions: string[], confirmations: string[], verId: string) {
  const now = new Date().toLocaleString('zh-CN');
  const entry = '## ' + now + '\n- 目标文件: ' + targetFile + '\n- 内容: ' + content.slice(0, 80) + '\n';
  await appendToBFile('change_log.md', entry, verId);
  if (questions.length > 0) {
    const qEntry = '## ' + now + '\n' + questions.map((q, i) => (i + 1) + '. ' + q).join('\n') + '\n';
    await appendToBFile('question_log.md', qEntry, verId);
  }
  if (confirmations.length > 0) {
    const cEntry = '## ' + now + '\n' + confirmations.map((c, i) => (i + 1) + '. ' + c).join('\n') + '\n';
    await appendToBFile('confirmation_log.md', cEntry, verId);
  }
}

function countQuestions(reply: string): number {
  // Tolerant: ## or ###, optional colon, then capture everything until next heading or end
  const section = reply.match(/(?:##|###)\s*本轮问题[：:]?\s*\n([\s\S]*?)(?=\n(?:##|###)\s|\n*$)/);
  const content = section ? section[1] : reply;

  // Count numbered items: 1. 或 1) 或 1、 后面紧跟 ** 或直接是文字
  const matches = content.match(/^\s*\d+[.)、]\s*/gm);
  return matches ? matches.length : 0;
}

async function callAI(apiKey: string, endpoint: string, msgs: ChatMessage[], versions: any[], activeId: string, questionCount: number, files: FileItem[], activeFileId: string, snapshot: string): Promise<string> {
  const systemMsg = { role: 'system', content: buildPrompt(versions, activeId, questionCount, files, activeFileId, snapshot) };
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
    { id: 'v0', title: 'v0', locked: false, active: true },
  ] as any,
  messages: [
    { id: 'm1', role: 'assistant' as const, content: '欢迎使用 AI 项目计划生成系统。请输入你的想法或目标，我来帮你逐步收敛为可执行的计划。', timestamp: '10:00' },
  ],
  activeVersionId: 'v0',
  activeFileId: 'f1',
  activeLineId: 'L01',
  inputText: '',
  lines: [{ id: 'L01', lineNumber: 1, text: '', type: 'paragraph' }],
  files: [],
  isReadOnly: false,
  temporaryActions: [],
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
        const aChildren: FileItem[] = [];
        const bChildren: FileItem[] = [];
        const cChildren: FileItem[] = [];
        const rootFiles: FileItem[] = [];
        for (const f of data) {
          if (f.type === 'folder' && f.name === 'a/') {
            // A-folder: its children will appear as a/* paths
          } else if (f.type === 'folder' && f.name === 'b/') {
            // B-folder: its children will appear as b/* paths
          } else if (f.type === 'folder' && f.name === 'c/') {
            // C-folder: its children will appear as c/* paths
          } else if (f.name.startsWith('b/')) {
            bChildren.push({ id: f.name, name: f.name.slice(2), type: f.type as any, category: 'b' });
          } else if (f.name.startsWith('a/')) {
            const shortName = f.name.slice(2).replace(/^\d+-/, '');
            aChildren.push({ id: f.name, name: shortName, type: f.type as any, category: 'a', light: 'gray' });
          } else if (f.name.startsWith('c/')) {
            cChildren.push({ id: f.name, name: f.name.slice(2), type: f.type as any, category: 'c' });
          } else {
            rootFiles.push({ id: f.name, name: f.name, type: f.type as any });
          }
        }
        const groups: FileItem[] = [];
        groups.push({ id: 'group:a', name: 'A 核心产出文档', type: 'folder', category: 'a', children: aChildren });
        groups.push({ id: 'group:b', name: 'B 治理文档', type: 'folder', category: 'b', children: bChildren });
        groups.push({ id: 'group:c', name: 'C 差异文档', type: 'folder', category: 'c', children: cChildren });
        groups.push({
          id: 'group:d', name: 'D 主入口索引', type: 'folder', category: 'a',
          children: [{ id: 'current/latest_plan.md', name: 'latest_plan.md', type: 'md', category: 'a' }],
        });
        const all = [...groups, ...rootFiles];
        set({ files: all, activeFileId: bChildren[0]?.id ?? aChildren[0]?.id ?? rootFiles[0]?.id ?? '' });
      })
      .catch(() => {});
  },

  selectFile: (id) => {
    // Recursively find file in files array (including children of group folders)
    function findFile(items: FileItem[]): FileItem | undefined {
      for (const f of items) {
        if (f.id === id) return f;
        if (f.children) {
          const found = findFile(f.children);
          if (found) return found;
        }
      }
      return undefined;
    }
    const file = findFile(get().files);
    if (!file) return;
    if (file.type === 'folder' && file.children) return; // group folder, handled by UI expand/collapse
    set({ activeFileId: id });
    if (file.type === 'folder') return;
    // Build path from id (which preserves full relative path like a/01-prd.md)
    const verId = get().activeVersionId;
    let relPath = 'letsgo/versions/' + verId + '/' + file.id;
    // D group file lives outside version dir
    if (file.id.startsWith('current/')) relPath = 'letsgo/' + file.id;
    fetch('/api/files?path=' + encodeURIComponent(relPath))
      .then((r) => r.json())
      .then((data) => {
        if (data.lines) {
          const lines = data.lines.map((l: any, i: number) => ({ ...l, active: i === 0 }));
          set({ lines, activeLineId: lines[0]?.id ?? '' });
          // Auto-evaluate light for A group files (skip if manually locked green)
          if (file.category === 'a' && !(file.lockedLight && file.light === 'green')) {
            const content = lines.map((l: any) => l.text).join('\n');
            const light = evaluateLight(content, file.name);
            set((s) => ({
              files: s.files.map((g) => {
                if (!g.children) return g;
                return { ...g, children: g.children.map((f) => f.id === id ? { ...f, light } : f) };
              }),
            }));
          }
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
    const { inputText, isReadOnly, apiKey, isLoading, activeFileId, files } = get();
    const text = inputText.trim();
    if (!text || isReadOnly || isLoading) return;

    // Block if current file is locked green
    const activeFile = (() => {
      for (const g of files) {
        if (g.id === activeFileId) return g;
        if (g.children) { const f = g.children.find(c => c.id === activeFileId); if (f) return f; }
      }
      return null;
    })();
    if (activeFile?.light === 'green' && activeFile?.lockedLight) {
      set((s) => ({
        messages: [...s.messages, { id: 'm' + (msgCounter++), role: 'assistant' as const,
          content: '当前文件已锁定为绿灯，不再追问。请切换到下一文档或派生新版本。', timestamp: now() }],
        inputText: '',
      }));
      return;
    }

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
      const questionCount = get().questionCount;
      // Build current document snapshot from editor lines
      const snapshot = get().lines.map(l => l.text).join('\n');
      const reply = await callAI(apiKey, get().apiEndpoint, [...get().messages], get().versions, get().activeVersionId, questionCount, get().files, get().activeFileId, snapshot);
      const parsedStage = parseStage(reply);

      // Validate question count matches expectation
      let finalReply = reply;
      const actualCount = countQuestions(reply);
      if (actualCount !== questionCount) {
        console.warn('[validate] 期望 ' + questionCount + ' 个问题，实际输出 ' + actualCount + ' 个');
        finalReply = reply + '\n\n---\n> 校验警告：期望 ' + questionCount + ' 个问题，实际生成 ' + actualCount + ' 个。';
      }

      // Strip JSON protocol block from visible text
      const visibleText = finalReply.replace(/```json[\s\S]*?```/g, '').trim() || finalReply;
      const newMsgs = [...get().messages, {
        id: 'm' + (msgCounter++), role: 'assistant' as const,
        content: visibleText, timestamp: now(),
        raw: finalReply, protocol: extractProtocol(finalReply),
      }];
      const updates: any = { messages: newMsgs, isLoading: false };
      if (parsedStage) {
        updates.versions = get().versions.map((v) => {
          if (v.id === get().activeVersionId) return { ...v, stage: parsedStage } as any;
          return v;
        });
      }
      set(updates);

      // Execute protocol from parsed message
      const protocol = newMsgs[newMsgs.length - 1].protocol;
      if (protocol) {
        setTimeout(() => executeProtocol(get(), protocol), 100);
      }
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
    const verId = get().activeVersionId;
    const dir = 'letsgo/versions/' + verId + '/b';
    try {
      const res = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: fullName, content: '# ' + fullName.replace('.md', '') + '\n\n', dir }),
      });
      if (!res.ok) { const err = await res.json(); alert(err.error || '创建失败'); return; }
      const data = await res.json();
      const newFile: FileItem = { id: 'b/' + data.name, name: data.name, type: data.type as FileItem['type'], category: 'b' };
      const currentFiles = get().files;
      // Add to b-group children
      const updated = currentFiles.map((f) => {
        if (f.id === 'group:b' && f.children) {
          return { ...f, children: [...f.children, newFile] };
        }
        return f;
      });
      set({ files: updated, activeFileId: newFile.id });
    } catch { alert('创建文件失败'); }
  },

  toggleLight: (fileId) => {
    set((s) => ({
      files: s.files.map((g) => {
        if (!g.children) return g;
        return {
          ...g,
          children: g.children.map((f) => {
            if (f.id !== fileId) return f;
            const current = f.light ?? 'gray';
            let next: 'gray' | 'green' | 'yellow';
            if (current === 'yellow') next = 'green';
            else if (current === 'green') next = 'gray';
            else next = 'green';
            return { ...f, light: next, lockedLight: next === 'green' };
          }),
        };
      }),
    }));
  },

  setLight: (fileId, light) => {
    set((s) => ({
      files: s.files.map((g) => {
        if (!g.children) return g;
        return {
          ...g,
          children: g.children.map((f) => {
            if (f.id !== fileId) return f;
            return { ...f, light, lockedLight: light === 'green' };
          }),
        };
      }),
    }));
  },
}));

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
  resetFile: (fileId: string) => Promise<void>;
  deleteFile: (fileId: string) => Promise<void>;
  deleteVersion: (versionId: string) => Promise<void>;
  pendingAction: { id: string; action: 'reset' | 'delete' | 'deleteVer' } | null;
  setPendingAction: (pa: { id: string; action: 'reset' | 'delete' | 'deleteVer' } | null) => void;
  confirmAndExec: (id: string, action: 'reset' | 'delete' | 'deleteVer') => void;
  questionGen: QuestionGenState | null;
}

// ── Heading node (for document section matching) ──
interface HeadingNode {
  level: number;
  title: string;
  bodyLines: string[];
  startLine: number;
}

// ── Merge result (structured write outcome) ──
interface MergeResult {
  ok: boolean;
  content: string;
  matchedHeading?: string;
  matchLevel?: number;
  matchType?: 'exact' | 'title-only';
  reason?: 'not_found' | 'empty_instruction';
}

// ── Question generation state machine ──
type QuestionGenStatus = 'first' | 'filling' | 'retrying' | 'done' | 'failed';

interface QuestionGenState {
  status: QuestionGenStatus;
  attempt: number;
  targetCount: number;
  actualCount: number;
  fillCount: number;
  warnings: string[];
}

interface ParsedQuestionBlock {
  sectionText: string;
  prefix: string;
  suffix: string;
  questions: { id: number; text: string; normalizedText: string }[];
}

interface QuestionValidation {
  ok: boolean;
  valid: { id: number; text: string }[];
  missingIds: number[];
  duplicateIds: { id: number; positions: number[] }[];
  emptyTextIds: number[];
  tooShortIds: number[];
  outOfRangeIds: number[];
  reason: string;
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
  '每轮提问数量由运行时指令指定，严格遵守。',
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
  '格式要求：每个问题必须严格按以下示例格式输出：',
  '',
  '1',
  '**这个项目的核心目标用户是谁？**',
  '- A：普通消费者，追求简单易用',
  '- B：企业用户，需要团队协作功能',
  '- C：开发者，需要API和可扩展性',
  '自行填写',
  '',
  '问题数量由运行时指令指定。不得输出空问题、不得用占位符替代选项。',
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
  '【这是你最重要的任务】每轮回复末尾必须输出 ```json 协议块，无一例外。即使用户只是选了选项，也必须输出 writeActions 把本轮确认的内容写入文档。禁止输出空的 writeActions。',
  '协议格式（严格按此结构）：',
  '{',
  '  "currentDocument": { "type": "文档类型", "file": "文件名", "status": "gray/yellow/green" },',
  '  "documentChain": [',
  '    { "type": "PRD", "file": "prd.md", "status": "gray", "locked": false },',
  '    ...',
  '  ],',
  '  "shouldAdvance": false,',
  '  "suggestedNextDocument": null,',
  '  "writeActions": [',
  '    { "targetFile": "a/01-prd.md", "operation": "upsert", "targetSection": "背景与概述", "content": "建议写入的内容" }',
  '  ],',
  '  "temporaryActions": [],',
  '  "questions": ["问题1", "问题2", "问题3"],',
  '  "confirmations": ["本轮已确认内容1"],',
  '  "uiActions": { "selectFile": null, "setLight": null, "lockCurrentDocument": false }',
  '}',
  '重要规则：',
  '- 每轮必带协议块，不管上下文是什么。用户选选项、简短回答、闲聊、任何情况都必须输出。',
  '- writeActions.content 必须是具体可写入的文档正文，不是对话摘要，不是复述问题，不要写"用户选择了A"。',
  '- 例如用户选了A选项"30次用完永久锁定"，你应该写：content: "猜错次数上限为30次，用完永久锁定，无法恢复。"',
  '- targetSection 用文档中的原标题，如"2. 背景与概述""3. 问题定义""4. 目标"',
  '- operation 推荐使用 upsert；同一 section 多轮对话应增量更新而不是整文件覆盖',
  '- shouldAdvance 为 true 时，必须同时设置 suggestedNextDocument 和 uiActions.selectFile',
  '- setLight 为 green 时，必须同时设置 lockCurrentDocument = true',
  '- 不确定内容走 temporaryActions，不得进 writeActions',
  '- 当前文档灰灯时 shouldAdvance 必须为 false',
  '- questions 最多 5 个',
  '- JSON 必须合法可解析，不得有注释或尾部逗号',
  '',
  '【阶段识别】: <draft|collecting|refining|confirmed>',
].join('\n');

const STATIC_SYSTEM = SYSTEM_PROMPT;
const B_TEMPLATE_FILES = new Set([
  'body.md',
  'version_summary.md',
  'change_log.md',
  'question_log.md',
  'confirmation_log.md',
  'lock_summary.md',
]);

function buildFileTree(data: any[]): FileItem[] {
  const aChildren: FileItem[] = [];
  const bChildren: FileItem[] = [];
  const cChildren: FileItem[] = [];
  const xChildren: FileItem[] = [];
  const rootFiles: FileItem[] = [];

  for (const f of data) {
    if (f.type === 'folder' && f.name === 'a/') continue;
    if (f.type === 'folder' && f.name === 'b/') continue;
    if (f.type === 'folder' && f.name === 'c/') continue;
    if (f.type === 'folder' && f.name === 'x/') continue;

    if (f.name.startsWith('b/')) {
      const shortName = f.name.slice(2);
      if (B_TEMPLATE_FILES.has(shortName)) {
        bChildren.push({ id: f.name, name: shortName, type: f.type as any, category: 'b' });
      } else {
        xChildren.push({ id: f.name, name: shortName, type: f.type as any, category: 'x', createdByUser: true, light: 'gray' });
      }
      continue;
    }

    if (f.name.startsWith('a/')) {
      aChildren.push({ id: f.name, name: f.name.slice(2).replace(/^\d+-/, ''), type: f.type as any, category: 'a', light: 'gray', hasTemplate: true });
      continue;
    }

    if (f.name.startsWith('c/')) {
      cChildren.push({ id: f.name, name: f.name.slice(2), type: f.type as any, category: 'c' });
      continue;
    }

    if (f.name.startsWith('x/')) {
      xChildren.push({ id: f.name, name: f.name.slice(2), type: f.type as any, category: 'x', createdByUser: true, light: 'gray' });
      continue;
    }

    rootFiles.push({ id: f.name, name: f.name, type: f.type as any });
  }

  const groups: FileItem[] = [];
  if (xChildren.length > 0) {
    groups.push({ id: 'group:x', name: 'X 自建文档', type: 'folder', category: 'x', children: xChildren });
  }
  groups.push({ id: 'group:a', name: 'A 核心产出文档', type: 'folder', category: 'a', children: aChildren });
  groups.push({ id: 'group:b', name: 'B 治理文档', type: 'folder', category: 'b', children: bChildren });
  groups.push({ id: 'group:c', name: 'C 差异文档', type: 'folder', category: 'c', children: cChildren });
  groups.push({ id: 'group:d', name: 'D 主入口索引', type: 'folder', category: 'd', children: [{ id: 'current/latest_plan.md', name: 'latest_plan.md', type: 'md', category: 'd' }] });
  return [...groups, ...rootFiles];
}

function findFileInTree(items: FileItem[], id: string): FileItem | undefined {
  for (const f of items) {
    if (f.id === id) return f;
    if (f.children) {
      const found = findFileInTree(f.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

function protocolHasRequiredFields(protocol: any): boolean {
  return !!protocol && typeof protocol === 'object'
    && protocol.currentDocument
    && Array.isArray(protocol.documentChain)
    && Array.isArray(protocol.writeActions)
    && protocol.uiActions
    && typeof protocol.shouldAdvance === 'boolean';
}

function normalizeTargetFile(targetFile: string, activeFileId: string, files: FileItem[]): string {
  if (!targetFile) return activeFileId;
  if (targetFile.includes('/')) return targetFile;

  const activeFile = findFileInTree(files, activeFileId);
  if (!activeFile) return activeFileId;

  if (activeFile.category === 'a') {
    const aGroup = files.find((f) => f.id === 'group:a');
    const match = aGroup?.children?.find((f) => f.name === targetFile || f.id.endsWith('/' + targetFile));
    if (match) return match.id;
  }

  if (activeFile.category === 'b') {
    const bGroup = files.find((f) => f.id === 'group:b');
    const match = bGroup?.children?.find((f) => f.name === targetFile || f.id.endsWith('/' + targetFile));
    if (match) return match.id;
  }

  if (activeFile.category === 'c') {
    const cGroup = files.find((f) => f.id === 'group:c');
    const match = cGroup?.children?.find((f) => f.name === targetFile || f.id.endsWith('/' + targetFile));
    if (match) return match.id;
  }

  if (activeFile.category === 'x') {
    const xGroup = files.find((f) => f.id === 'group:x');
    const match = xGroup?.children?.find((f) => f.name === targetFile || f.id.endsWith('/' + targetFile));
    if (match) return match.id;
  }

  const sibling = activeFile.category
    ? files.flatMap((g) => g.children ?? []).find((f) => f.category === activeFile.category && (f.name === targetFile || f.id.endsWith('/' + targetFile)))
    : undefined;
  return sibling?.id ?? activeFileId;
}

function resolveHeadingMatch(headings: HeadingNode[], targetTitle: string): { node: HeadingNode; matchType: 'exact' | 'title-only' } | null {
  const normalizedTarget = normalizeHeadingText(targetTitle);
  const exact = headings.find((node) => normalizeHeadingText(node.title) === normalizedTarget);
  if (exact) return { node: exact, matchType: 'exact' };

  const targetTokens = normalizedTarget.split(' ').filter(Boolean);
  if (targetTokens.length === 0) return null;
  const titleOnly = headings.find((node) => {
    const normalizedTitle = normalizeHeadingText(node.title);
    if (normalizedTitle === normalizedTarget) return true;
    if (normalizedTitle.endsWith(normalizedTarget) || normalizedTitle.startsWith(normalizedTarget)) return true;
    const headToken = targetTokens[0];
    const tailToken = targetTokens[targetTokens.length - 1];
    return normalizedTitle.endsWith(' ' + normalizedTarget) || normalizedTitle.startsWith(normalizedTarget + ' ') || normalizedTitle.endsWith(' ' + tailToken) || normalizedTitle.startsWith(headToken + ' ');
  });
  return titleOnly ? { node: titleOnly, matchType: 'title-only' } : null;
}

function mergeAContent(currentContent: string, action: any): MergeResult {
  let instruction = typeof action?.content === 'string' ? action.content.trim() : '';
  const section = typeof action?.targetSection === 'string' ? action.targetSection.trim() : '';
  if (!section) {
    console.log('[autoWrite] mergeAContent: 无 targetSection, 插入首标题下');
    return { ok: true, content: upsertUnderFirstHeading(currentContent, instruction) };
  }

  const headings = parseAllHeadings(currentContent);
  const match = resolveHeadingMatch(headings, section);
  if (!match) {
    console.warn('[autoWrite] mergeAContent: 未找到 section=', section, 'targetTitle=', normalizeHeadingText(section));
    return { ok: false, content: currentContent, reason: 'not_found' };
  }

  // Level-aware stray header cleaning: only cut at sibling/parent headers, keep sub-headers
  const targetLevel = match.node.level;
  const instLines = instruction.split('\n');
  let cutIdx = instLines.length;
  for (let i = 0; i < instLines.length; i++) {
    const m = instLines[i].match(/^(#{1,6})\s+/);
    if (m && m[1].length <= targetLevel) {
      cutIdx = i;
      break;
    }
  }
  if (cutIdx < instLines.length) {
    const stripped = instLines.slice(0, cutIdx).join('\n').trim();
    console.log('[autoWrite] mergeAContent: 裁剪越界标题, 原长度=', instruction.length, '裁剪后=', stripped.length, 'targetLevel=', targetLevel, '越界行=', instLines[cutIdx].slice(0, 40));
    instruction = stripped;
  }

  console.log('[autoWrite] mergeAContent: section=', section, 'instruction length=', instruction.length);
  if (!instruction) {
    console.log('[autoWrite] mergeAContent: instruction 为空, 跳过');
    return { ok: false, content: currentContent, reason: 'empty_instruction' };
  }

  let skipChildren = false;
  const nextContent = headings.map((node) => {
    const headingLine = `${'#'.repeat(node.level)} ${node.title}`;
    if (node === match.node) {
      skipChildren = true;
      return [headingLine, ...instruction.split('\n')].join('\n');
    }
    if (skipChildren && node.level > match.node.level) return null;
    skipChildren = false;
    return [headingLine, ...node.bodyLines].join('\n');
  }).filter(Boolean).join('\n');

  const matchedHeading = `${'#'.repeat(match.node.level)} ${match.node.title}`;
  console.log('[autoWrite] mergeAContent: 找到 section, heading=', matchedHeading, 'level=', match.node.level, 'matchType=', match.matchType, 'existing body lines=', match.node.bodyLines.length);
  return {
    ok: true,
    content: nextContent,
    matchedHeading,
    matchLevel: match.node.level,
    matchType: match.matchType,
  };
}


function upsertUnderFirstHeading(content: string, addition: string): string {
  const trimmed = content.trim();
  if (!trimmed) return addition;
  const lines = trimmed.split('\n');
  const idx = lines.findIndex((line) => /^#{1,6}\s+/.test(line));
  if (idx < 0) return trimmed + '\n\n' + addition;
  return lines.slice(0, idx + 1).join('\n') + '\n' + addition + '\n' + lines.slice(idx + 1).join('\n');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildRuntimeContext(questionCount: number, versions: any[], activeId: string, files: FileItem[], activeFileId: string, snapshot: string): string {
  const v = versions.find((x: any) => x.id === activeId);
  const stage = v?.stage ?? 'draft';

  // Dynamically generate the question format template based on questionCount
  let questionList = '';
  for (let i = 1; i <= questionCount; i++) {
    if (i > 1) questionList += '\n';
    questionList += i + '. **示例问题文本，需替换为实际内容**\n';
    questionList += '  - A：选项描述（需替换为实际选项）\n';
    questionList += '  - B：选项描述（需替换为实际选项）\n';
    questionList += '  - C：选项描述（需替换为实际选项）';
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
    '项目领域边界：只讨论与 ' + (currentDocType || '当前文档') + ' 直接相关的概念，禁止引入不属于本项目的机制或术语。',
    '',
    '文档链进度：',
    chainStatus.trim(),
    '',
    '本轮规则：',
    '- 灰灯：继续追问当前文档，补全缺口',
    '- 黄灯：建议收口，但仍可补问',
    '- 绿灯/锁定：当前文档结束，不得追问',
    '- 当前文档未完成（灰/黄），不得跳到下一个文档',
    '- 当前文档内按 section 顺序优先追问，前面未完成的 section 补完之前不得跳到后面的 section',
    '- 当前文档完成后，自动进入下一个文档',
    '- 不输出未激活文档的内容',
    '',
  ].join('\n');

  let ctx = '【硬性指令】你必须且只能提出**恰好 ' + questionCount + ' 个**问题。不满 ' + questionCount + ' 个或多于 ' + questionCount + ' 个均为错误。\n\n';
  ctx += '【问题输出格式模板】\n' + questionList + '\n\n';
  ctx += context;
  ctx += '\n\n【协议要求 — 本轮必须执行】\n';
  ctx += '输入类型路由：用户消息以【inputType=answer】开头时，表明这是对当前问题的答案，必须输出 writeActions 写入文档。以【inputType=idea】开头时，表明这是新想法，必须开启新一轮追问，不得映射为当前问题答案。\n';
  ctx += '你的回复末尾必须包含 ```json 协议块。即使用户只是选了选项、说了"好"、或简短回答，也必须输出。\n';
  ctx += 'writeActions.content 规则：\n';
  ctx += '  1. 只写本轮用户明确确认的内容，写成可直接放入文档的正文。\n';
  ctx += '  2. 禁止包含模板占位符（如{项目名称}、{编号}等）。\n';
  ctx += '  3. 禁止包含其他 section 的 ## 标题。\n';
  ctx += '  4. 只写 targetSection 指定的那个段落的内容，不要越界写其他 section。\n';
  ctx += '  5. 用户选了选项A"30次用完锁定"，写成"猜错上限30次，用完永久锁定"，不是"用户选择了A"。\n';
  ctx += '本轮用户回答（包括选项选择）确认的所有信息都是重要信息，必须全部写入对应 section。禁止延迟写入、禁止跳过。writeActions 不得为空。';
  if (stage === 'collecting') ctx += '\n\n当前阶段: 收集中。请围绕缺口继续追问。';
  if (stage === 'refining') ctx += '\n\n当前阶段: 精进中。方向已明确。';
  if (stage === 'confirmed') ctx += '\n\n当前阶段: 已确认。可要求 locklock 锁定。';
  if (snapshot) ctx += '\n\n【当前文件内容快照】\n```\n' + snapshot + '\n```';
  return ctx;
}

function parseStage(reply: string): VersionStage | null {
  const m = reply.match(/【阶段识别】[：:]\s*(draft|collecting|refining|confirmed)/i);
  return m ? (m[1].toLowerCase() as VersionStage) : null;
}

function extractProtocol(reply: string): any | null {
  const idx = reply.indexOf('```json');
  if (idx < 0) { console.log('[autoWrite] extractProtocol: 未找到 ```json 块'); return null; }
  // Log context around the match
  const before = reply.slice(Math.max(0, idx - 20), idx);
  const after = reply.slice(idx, idx + 500);
  console.log('[autoWrite] extractProtocol: 找到 ```json 位置=' + idx + ', 前20字符:', JSON.stringify(before), ', 后500字符:', JSON.stringify(after));
  
  const m = reply.match(/```json\s*\n([\\s\S]*?)\n```/);
  if (!m) {
    // Try more flexible patterns
    const m2 = reply.match(/```json\s*([\s\S]*?)```/);
    if (m2) {
      console.log('[autoWrite] extractProtocol: 宽松匹配成功, JSON 内容:', m2[1].slice(0, 200));
      try { const p = JSON.parse(m2[1].trim()); console.log('[autoWrite] extractProtocol: JSON 解析成功, keys=', Object.keys(p)); return p; }
      catch (e) { console.log('[autoWrite] extractProtocol: JSON 解析失败', e); return null; }
    }
    console.log('[autoWrite] extractProtocol: 严格和宽松匹配都失败');
    return null;
  }
  try { const p = JSON.parse(m[1]); console.log('[autoWrite] extractProtocol: 严格匹配成功, keys=', Object.keys(p)); return p; }
  catch (e) { console.log('[autoWrite] extractProtocol: JSON 解析失败', e); return null; }
}

async function executeProtocol(store: any, protocol: any) {
  console.log('[autoWrite] executeProtocol: 开始, protocol keys=', Object.keys(protocol || {}));
  const writeActions = Array.isArray(protocol?.writeActions) ? protocol.writeActions : [];
  const uiActions = protocol?.uiActions ?? null;
  const activeFile = findFileInTree(store.files, store.activeFileId);
  const activeVersionId = store.activeVersionId;
  console.log('[autoWrite] executeProtocol: activeFile=', activeFile?.id, 'writeActions count=', writeActions.length);

  if (!protocolHasRequiredFields(protocol)) {
    console.warn('[autoWrite] executeProtocol: protocol 缺少必填字段');
    return;
  }

  if (writeActions.length > 0) {
    const normalizedActions = writeActions.map((a: any) => ({ ...a, targetFile: normalizeTargetFile(a?.targetFile || '', activeFile?.id || store.activeFileId, store.files) }));
    console.log('[autoWrite] executeProtocol: normalizedActions=', normalizedActions.map((a: any) => ({ targetFile: a.targetFile, targetSection: a.targetSection })));

    let workingContent = store.lines.map((l: any) => l.text).join('\n');
    let wroteAny = false;
    for (const action of normalizedActions) {
      console.log('[autoWrite] executeProtocol: 执行 action section=', action?.targetSection);
      const mergeResult = mergeAContent(workingContent, action);
      if (!mergeResult.ok) {
        console.warn('[autoWrite] executeProtocol: mergeAContent 失败, reason=', mergeResult.reason, 'section=', action?.targetSection);
        continue;
      }
      console.log('[autoWrite] executeProtocol: content length before=', workingContent.length, 'after=', mergeResult.content.length);
      if (mergeResult.content !== workingContent) {
        const added = mergeResult.content.length > workingContent.length ? mergeResult.content.slice(workingContent.length) : '(替换)';
        console.log('[autoWrite] executeProtocol: 新增内容:', added.slice(0, 200));
      }
      workingContent = mergeResult.content;
      wroteAny = true;
    }

    if (wroteAny) {
      const nextLines = workingContent.split('\n').map((text: string, i: number) => ({
        id: 'wL' + (i + 1),
        lineNumber: i + 1,
        text,
        type: text.startsWith('#') ? 'heading' : text.startsWith('-') ? 'list' : text.startsWith('>') ? 'quote' : 'paragraph',
        active: i === 0,
      }));
      store.setEditorLines(nextLines);
      console.log('[autoWrite] executeProtocol: 编辑器已更新, 开始写磁盘...');
      await fetch('/api/files/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: 'letsgo/versions/' + activeVersionId + '/' + (activeFile?.id || ''), content: workingContent }),
      });
      console.log('[autoWrite] executeProtocol: 磁盘写入完成');
      store.selectFile(activeFile?.id || '');
      console.log('[autoWrite] executeProtocol: selectFile 完成');
      syncBAfterWrite(activeFile?.id || '', writeActions.map((a: any) => a?.content || '').join('\n'), protocol.questions ?? [], protocol.confirmations ?? [], activeVersionId);
    }
  }

  if (!uiActions) return;
  if (uiActions.selectFile) {
    const fileId = findFileId(store.files, uiActions.selectFile);
    if (fileId) store.selectFile(fileId);
  }
  if (uiActions.setLight) {
    const activeId = store.activeFileId;
    if (activeId) store.setLight(activeId, uiActions.setLight);
  }
  if (uiActions.lockCurrentDocument) {
    store.locklockVersion(store.activeVersionId);
  }
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
  return calcDocumentProgress(content, docName ?? '', false, 'a').light;
}

export interface DocumentProgress {
  percent: number;
  light: 'gray' | 'yellow' | 'green';
  label: string;
  missingSections: string[];
  hasPlaceholder: boolean;
  reason: string;
}


// ── Heading parser ──

function normalizeHeadingText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function parseAllHeadings(content: string): HeadingNode[] {
  const lines = content.split('\n');
  const nodes: HeadingNode[] = [];
  let current: HeadingNode | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      if (current) nodes.push(current);
      current = {
        level: match[1].length,
        title: match[2].trim(),
        bodyLines: [],
        startLine: i,
      };
    } else if (current) {
      current.bodyLines.push(line);
    }
  }

  if (current) nodes.push(current);
  return nodes;
}

function extractSectionBody(content: string, headings: HeadingNode[], sectionTitle: string): string {
  const normalizedTarget = normalizeHeadingText(sectionTitle);
  const match = resolveHeadingMatch(headings, normalizedTarget);
  if (!match) return '';
  return match.node.bodyLines.join('\n').trim();
}

function isMeaningfulSectionBody(body: string): boolean {
  if (!body) return false;
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
  const cleanedLines = lines.filter(line => {
    if (/^#{1,6}\s+/.test(line)) return false;
    if (/^\{[^}]+\}$/.test(line)) return false;
    if (/^[-*+]\s*(xxx|TODO|TBD|待确认|未定|暂存|未确认|请填写|待补充|示例|…|\.{2,})$/i.test(line)) return false;
    if (/^[-*+]\s*(项目背景|当前问题|现状痛点|功能说明|验收标准|技术栈|测试规范|业务目标|产品目标|工程目标)$/i.test(line)) return false;
    if (/^[|\-\s:]+$/.test(line)) return false;
    return true;
  });
  const joined = cleanedLines.join('\n').replace(/^[-*+]\s+.{1,15}$/gm, '').trim();
  if (joined.length < 30) return false;
  const hasSentenceLike = /[。！？]/.test(joined) || /[A-Za-z0-9]{8,}/.test(joined) || /[\u4e00-\u9fa5]{12,}/.test(joined);
  if (!hasSentenceLike) return false;
  const meaningful = cleanedLines.filter(line => {
    if (/^[-*+]\s+/.test(line)) { const c = line.replace(/^[-*+]\s+/, '').trim(); return c.length > 15 && !/^(项目背景|当前问题|现状痛点|功能说明|验收标准|技术栈|测试规范|业务目标|产品目标|工程目标)$/i.test(c); }
    return line.length >= 15;
  });
  return meaningful.length > 0;
}

function countTemplateSignals(content: string): number {
  let count = 0;
  if (/{[^}]+}/.test(content)) count += 2;
  if (/TODO|TBD/i.test(content)) count += 2;
  if (/待确认|未定|暂存|未确认|请填写|待补充|这里填写|示例/i.test(content)) count += 2;
  const sk1 = content.match(/^[-*+]\s*(xxx|…|\.{2,}|请填写|待补充|示例)$/gim) || [];
  if (sk1.length > 0) count += 3;
  const sk2 = content.match(/^[-*+]\s*(项目背景|当前问题|现状痛点|功能说明|验收标准|技术栈|测试规范|业务目标|产品目标|工程目标)$/gim) || [];
  if (sk2.length > 0) count += 3;
  const listLines = content.match(/^\s*[-*+]\s+.+$/gm) || [];
  if (listLines.length >= 10) count += 1;
  return count;
}

type DocumentRule = {
  yellowMinCompleted: number;
  greenMinCompleted: number;
  minBodyForGreen: number;
  minBodyForYellow: number;
};

function getDocumentRule(docName: string): DocumentRule {
  const total = getRequiredSections(docName).length || 1;
  if (docName.includes('prd'))       return { yellowMinCompleted: Math.ceil(total*0.7), greenMinCompleted: total, minBodyForGreen: 200, minBodyForYellow: 100 };
  if (docName.includes('features'))  return { yellowMinCompleted: Math.ceil(total*0.6), greenMinCompleted: total, minBodyForGreen: 180, minBodyForYellow: 90 };
  if (docName.includes('rules'))     return { yellowMinCompleted: Math.ceil(total*0.6), greenMinCompleted: total, minBodyForGreen: 200, minBodyForYellow: 100 };
  if (docName.includes('rfc') && !docName.includes('prd')) return { yellowMinCompleted: Math.ceil(total*0.6), greenMinCompleted: total, minBodyForGreen: 180, minBodyForYellow: 80 };
  if (docName.includes('implementation')) return { yellowMinCompleted: Math.ceil(total*0.5), greenMinCompleted: total, minBodyForGreen: 150, minBodyForYellow: 70 };
  if (docName.includes('code-review')) return { yellowMinCompleted: Math.ceil(total*0.5), greenMinCompleted: total, minBodyForGreen: 120, minBodyForYellow: 60 };
  if (docName.includes('testing'))  return { yellowMinCompleted: Math.ceil(total*0.5), greenMinCompleted: total, minBodyForGreen: 140, minBodyForYellow: 70 };
  if (docName.includes('change-management')) return { yellowMinCompleted: Math.ceil(total*0.5), greenMinCompleted: total, minBodyForGreen: 130, minBodyForYellow: 60 };
  return { yellowMinCompleted: Math.ceil(total*0.5), greenMinCompleted: total, minBodyForGreen: 100, minBodyForYellow: 50 };
}

function getMeaningfulTextLength(content: string): number {
  return content
    .replace(/^#{1,6}\s+.+$/gm, '')
    .replace(/\{[^}]+\}/g, '')
    .replace(/\bTODO\b|\bTBD\b|待确认|未定|暂存|未确认|请填写|待补充|示例/gi, '')
    .replace(/^[-*+]\s*(xxx|…|\.{2,}|请填写|待补充|示例)$/gim, '')
    .replace(/^[-*+]\s*(项目背景|当前问题|现状痛点|功能说明|验收标准|技术栈|测试规范|业务目标|产品目标|工程目标)$/gim, '')
    .replace(/^[-*+]\s+.{1,15}$/gm, '')
    .replace(/^[|\-\s:]+$/gm, '')
    .trim().length;
}

function analyzeDocument(content: string, docName: string) {
  const required = getRequiredSections(docName);
  const headings = parseAllHeadings(content);
  const sectionResults = required.map(section => {
    const body = extractSectionBody(content, headings, section);
    return { section, body, complete: isMeaningfulSectionBody(body) };
  });
  const missingSections = sectionResults.filter(r => !r.complete).map(r => r.section);
  const completedCount = sectionResults.filter(r => r.complete).length;
  const hasPlaceholder = /{[^}]+}|TODO|TBD|待确认|未定|暂存|未确认|请填写|待补充/i.test(content);
  const meaningfulTextLength = getMeaningfulTextLength(content);
  const templateSignalCount = countTemplateSignals(content);
  const skeletonLineCount = content.split('\n').filter(line => {
    const t = line.trim();
    return /^[-*+]\s*(xxx|…|\.{2,}|请填写|待补充|示例)$/i.test(t) ||
           /^[-*+]\s*(项目背景|当前问题|现状痛点|功能说明|验收标准|技术栈|测试规范|业务目标|产品目标|工程目标)$/i.test(t) ||
           /^\{[^}]+\}$/.test(t);
  }).length;
  const isPureTemplate = completedCount === 0 && meaningfulTextLength < 60 && templateSignalCount >= 3 && skeletonLineCount >= 3;
  return { required, missingSections, completedCount, hasPlaceholder, meaningfulTextLength, templateSignalCount, headingCount: headings.length, skeletonLineCount, isPureTemplate };
}

export function calcDocumentProgress(content: string, docName: string, locked: boolean, category?: string): DocumentProgress {
  if (locked) return { percent: 100, light: 'green', label: '已锁定', missingSections: [], hasPlaceholder: false, reason: '已锁定' };
  if (category && category !== 'a') return { percent: 100, light: 'green', label: '', missingSections: [], hasPlaceholder: false, reason: '' };

  const info = analyzeDocument(content, docName);
  const rule = getDocumentRule(docName);

  if (info.isPureTemplate) {
    return { percent: 0, light: 'gray', label: '纯模板', missingSections: info.missingSections, hasPlaceholder: true, reason: '纯模板，无实质内容' };
  }
  if (info.completedCount === 0 && info.meaningfulTextLength < 60) {
    return { percent: 0, light: 'gray', label: '纯模板', missingSections: info.missingSections, hasPlaceholder: true, reason: '纯模板，无实质内容' };
  }

  const reqCount = info.required.length || 1;
  let percent = Math.round(info.completedCount / reqCount * 70);
  if (info.meaningfulTextLength >= 200) percent += 12;
  else if (info.meaningfulTextLength >= 80) percent += 8;
  else if (info.meaningfulTextLength >= 30) percent += 4;
  if (info.headingCount >= 5) percent += 3;
  else if (info.headingCount >= 3) percent += 2;
  if (!info.hasPlaceholder) percent += 8;
  if (info.meaningfulTextLength >= 50) percent += 5;
  if (info.skeletonLineCount >= 8) percent -= 12;
  else if (info.skeletonLineCount >= 5) percent -= 6;
  else if (info.skeletonLineCount >= 3) percent -= 3;
  if (info.completedCount === 0) percent = Math.min(percent, 20);
  else if (info.completedCount <= 2) percent = Math.min(percent, 55);
  percent = Math.max(0, Math.min(100, percent));

  let light: 'gray' | 'yellow' | 'green' = 'gray';
  const isComplete = info.completedCount >= rule.greenMinCompleted && !info.hasPlaceholder && info.meaningfulTextLength >= rule.minBodyForGreen && info.templateSignalCount < 3;
  const isNearly = info.completedCount >= rule.yellowMinCompleted && info.meaningfulTextLength >= rule.minBodyForYellow && !info.hasPlaceholder;

  if (isComplete) { light = 'green'; percent = Math.max(percent, 95); }
  else if (isNearly) { light = 'yellow'; percent = Math.max(percent, 70); }
  else { light = 'gray'; percent = Math.min(percent, 69); }

  const reason = light === 'green' ? '已完成' :
    light === 'yellow' ? `还缺 ${info.missingSections.length} 个章节` :
    info.completedCount === 0 ? '章节均未完成' :
    info.hasPlaceholder ? '存在占位符' :
    info.skeletonLineCount >= 5 ? '仍为模板骨架' :
    '内容过短或信息不足';

  return { percent, light,
    label: light === 'green' ? '已完成' : light === 'yellow' ? '接近完成' : '进行中',
    missingSections: info.missingSections, hasPlaceholder: info.hasPlaceholder, reason };
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

function cleanText(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/^\*+/, '')
    .replace(/\*+$/, '')
    .replace(/^[-–•]\s*/, '')
    .replace(/^\.\s*/, '')
    .replace(/^\([^)]*\)\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseQuestionsBlock(reply: string): ParsedQuestionBlock {
  // Extract ### 本轮问题 section
  const match = reply.match(/(?:##|###)\s*本轮问题[：:]?\s*\n([\s\S]*?)(?=\n(?:##|###)\s|\n```json\b|$)/);
  if (!match) return { sectionText: '', prefix: reply, suffix: '', questions: [] };

  const sectionText = match[0];
  const prefix = reply.slice(0, match.index!);
  const suffix = reply.slice(match.index! + sectionText.length);
  const body = match[1];

  // Split into blocks by question number boundaries
  const lines = body.split('\n');
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    const isStart = /^\d+[.)、]?\s+/.test(trimmed) || /^\d+\s*$/.test(trimmed);
    if (isStart && current.length > 0) {
      blocks.push(current);
      current = [rawLine];
    } else {
      current.push(rawLine);
    }
  }
  if (current.length > 0) blocks.push(current);

  // Parse each block
  const questions: ParsedQuestionBlock['questions'] = [];
  for (const block of blocks) {
    const blockLines = block.map(l => l.trim()).filter(Boolean);
    if (blockLines.length === 0) continue;

    // Extract id from first line
    const idMatch = blockLines[0].match(/^(\d+)[.)、]?\s*(.*)$/);
    if (!idMatch) continue;
    const id = parseInt(idMatch[1]);

    // Extract question text (from number line or next line)
    let text = cleanText(idMatch[2] || '');
    if (!text && blockLines.length > 1 && !/^[A-C][.：)]/.test(blockLines[1])) {
      text = cleanText(blockLines[1]);
    }

    if (!text || text === '') continue; // skip empty questions

    const normText = normalizeQuestionText(text);
    if (!questions.find(q => q.id === id)) {
      questions.push({ id, text, normalizedText: normText });
    }
  }

  return { sectionText, prefix, suffix, questions };
}

function normalizeQuestionText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').replace(/[。.?？!！]+$/g, '');
}

function countQuestions(reply: string): number {
  return parseQuestionsBlock(reply).questions.length;
}

function countChineseChars(text: string): number {
  return (text.match(/[\u4e00-\u9fa5]/g) || []).length;
}

function validateQuestionBlock(block: ParsedQuestionBlock, targetCount: number): QuestionValidation {
  const result: QuestionValidation = {
    ok: false, valid: [], missingIds: [], duplicateIds: [], emptyTextIds: [],
    tooShortIds: [], outOfRangeIds: [], reason: '',
  };

  const qs = block.questions;
  const idMap = new Map<number, number[]>();
  for (let i = 0; i < qs.length; i++) {
    const existing = idMap.get(qs[i].id) || [];
    existing.push(i);
    idMap.set(qs[i].id, existing);
  }

  // 检查越界编号
  for (const id of idMap.keys()) {
    if (id < 1 || id > targetCount) result.outOfRangeIds.push(id);
  }

  // 检查重复编号
  for (const [id, positions] of idMap) {
    if (positions.length > 1) result.duplicateIds.push({ id, positions });
  }

  // 检查缺失编号 (1..targetCount)
  for (let i = 1; i <= targetCount; i++) {
    if (!idMap.has(i)) result.missingIds.push(i);
  }

  // 检查内容和长度
  for (const q of qs) {
    if (!q.text.trim()) {
      result.emptyTextIds.push(q.id);
    } else if (countChineseChars(q.text) < 3) {
      result.tooShortIds.push(q.id);
    } else {
      result.valid.push(q);
    }
  }

  // 判定 ok: 无缺口、无重复、无越界、无空文本、无过短
  if (result.missingIds.length === 0 && result.duplicateIds.length === 0
      && result.outOfRangeIds.length === 0 && result.emptyTextIds.length === 0
      && result.tooShortIds.length === 0) {
    result.ok = true;
  } else {
    const parts: string[] = [];
    if (result.missingIds.length > 0) parts.push('缺号: ' + result.missingIds.join(','));
    if (result.duplicateIds.length > 0) parts.push('重复: ' + result.duplicateIds.map(d => d.id).join(','));
    if (result.outOfRangeIds.length > 0) parts.push('越界: ' + result.outOfRangeIds.join(','));
    if (result.emptyTextIds.length > 0) parts.push('空文本: ' + result.emptyTextIds.join(','));
    if (result.tooShortIds.length > 0) parts.push('过短: ' + result.tooShortIds.join(','));
    result.reason = parts.join('; ');
  }

  return result;
}

interface TokenUsage { prompt: number; completion: number; total: number; }

async function callAI(apiKey: string, endpoint: string, msgs: ChatMessage[], versions: any[], activeId: string, questionCount: number, files: FileItem[], activeFileId: string, snapshot: string, retryContext?: string): Promise<{ content: string; usage: TokenUsage | null }> {
  let runtimeCtx = buildRuntimeContext(questionCount, versions, activeId, files, activeFileId, snapshot);
  if (retryContext) runtimeCtx = retryContext + '\n\n' + runtimeCtx;

  const chatMsgs = msgs.map((m) => ({ role: m.role as string, content: m.content }));
  const lastUser = [...chatMsgs].reverse().find(m => m.role === 'user');
  const msgList = [
    { role: 'system', content: STATIC_SYSTEM },
    { role: 'user', content: runtimeCtx },
    ...(lastUser ? [lastUser] : []),
  ];
  console.log('[callAI] msgs=' + msgList.length + ' | ' + msgList.map(m => m.role[0] + ':' + m.content.length).join(' '));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({ model: 'deepseek-chat', messages: msgList, temperature: 0.7, max_tokens: 16384 }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) { const err = await res.text(); throw new Error('API error ' + res.status + ': ' + err); }
    const data = await res.json();
    const rawReply = data.choices?.[0]?.message?.content ?? '';
    console.log('[callAI] AI 原始回复长度:', rawReply.length);
    console.log('[callAI] AI 回复末尾 200 字符:', rawReply.slice(-200));
    const u = data.usage;
    return {
      content: data.choices?.[0]?.message?.content ?? '',
      usage: u ? { prompt: u.prompt_tokens, completion: u.completion_tokens, total: u.total_tokens } : null,
    };
  } finally {
    clearTimeout(timer);
  }
}

function trimAndValidate(block: ParsedQuestionBlock, questionCount: number, genState: QuestionGenState): { block: ParsedQuestionBlock; validation: QuestionValidation } {
  const beforeTrim = block.questions.length;
  block.questions = block.questions.filter(q => q.id >= 1 && q.id <= questionCount);
  if (block.questions.length < beforeTrim) {
    genState.warnings.push('模型多输出了 ' + (beforeTrim - block.questions.length) + ' 个越界问题，已修剪');
  }
  const validation = validateQuestionBlock(block, questionCount);
  return { block, validation };
}

// ── ensureQuestionCount: validate + fill + retry ──

function mergeQuestionBlock(original: ParsedQuestionBlock, fillBlock: ParsedQuestionBlock): ParsedQuestionBlock {
  const idMap = new Map<number, string>();
  for (const q of original.questions) idMap.set(q.id, q.text);
  for (const q of fillBlock.questions) idMap.set(q.id, q.text);

  const existingIds = Array.from(idMap.keys());
  const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0;

  const lines: string[] = ['### 本轮问题'];
  for (let i = 1; i <= maxId; i++) {
    const text = idMap.get(i);
    if (text) lines.push(i + '\n**' + text + '**\n- A：...\n- B：...\n- C：...');
  }

  return {
    sectionText: lines.join('\n'),
    prefix: original.prefix,
    suffix: original.suffix,
    questions: Array.from(idMap.entries()).map(([id, text]) => {
      const normText = normalizeQuestionText(text);
      return { id, text, normalizedText: normText };
    }).sort((a, b) => a.id - b.id),
  };
}

function buildFillPrompt(
  missingIds: number[],
  existingQuestions: { id: number; text: string }[],
  snapshot: string
): string {
  const existingList = existingQuestions
    .sort((a, b) => a.id - b.id)
    .map(q => q.id + '. ' + q.text)
    .join('\n');
  const missingList = missingIds.join(', ');

  return [
    '【填缺指令】上一轮已生成 ' + existingQuestions.length + ' 个问题，缺少以下编号：' + missingList,
    '',
    '规则：只补足缺失编号的问题，不重写已有问题。',
    '输出格式：只包含 ### 本轮问题 段，不输出其他段落（当前理解/缺口分析等）。',
    '问题结构：每个编号独占一行，下一行是问题文本（**加粗**），然后是 A/B/C 选项。',
    '必须恰好补 ' + missingIds.length + ' 个，不多不少。',
    '每个问题必须有实质内容，不能空泛。',
    '不得重复已有问题的内容或角度。',
    '',
    '【已有问题（勿动）】',
    existingList.slice(0, 2500),
    '',
    '【当前文档快照（仅用于理解上下文）】',
    '```',
    snapshot.slice(0, 1500),
    '```',
  ].join('\n');
}

function buildRetrySystemMsg(failureReason: string, questionCount: number): string {
  return [
    '【重试指令 — 这是最终兜底重试】',
    '上一轮失败原因：' + failureReason,
    '',
    '你必须严格遵守以下要求：',
    '1. 恰好输出 ' + questionCount + ' 个问题，编号从 1 到 ' + questionCount + ' 连续不跳号',
    '2. 每个问题必须有实质内容，不可空泛、不可模板句',
    '3. 不要输出上一轮已失败的内容',
    '4. 如果仍失败，不允许编造成功 — 系统会校验',
    '5. 所有 ### 段（当前理解/缺口分析/状态判断/下一步/本轮问题）必须全量输出',
    '',
    '这是第二次尝试，也是最后一次。请严格遵守格式和数量要求。',
  ].join('\n');
}

async function ensureQuestionCount(
  reply: string,
  questionCount: number,
  snapshot: string,
  apiKey: string,
  endpoint: string,
  msgs: ChatMessage[],
  versions: any[],
  activeVersionId: string,
  files: FileItem[],
  activeFileId: string,
): Promise<{ finalReply: string; genState: QuestionGenState; extraUsage: TokenUsage | null }> {
  let genState: QuestionGenState = {
    status: 'first', attempt: 0, targetCount: questionCount, actualCount: 0, fillCount: 0, warnings: [],
  };
  let extraUsage: TokenUsage | null = null;
  const addUsage = (u: TokenUsage | null) => {
    if (!u) return;
    if (!extraUsage) extraUsage = { prompt: 0, completion: 0, total: 0 };
    extraUsage.prompt += u.prompt;
    extraUsage.completion += u.completion;
    extraUsage.total += u.total;
  };

  let block = parseQuestionsBlock(reply);
  const origQuestionCount = block.questions.length;
  let { block: trimmedBlock, validation } = trimAndValidate(block, questionCount, genState);
  block = trimmedBlock;
  genState.actualCount = block.questions.length;

  if (validation.ok) {
    genState.status = 'done';
    // Only rebuild reply when trimming removed questions; otherwise preserve original options
    let finalReply = reply;
    if (block.questions.length < origQuestionCount) {
      finalReply = block.prefix + '\n' + block.sectionText + '\n' + block.suffix;
    }
    return { finalReply, genState, extraUsage };
  }

  // 补缺条件: 只有缺口(无重复/越界/空文本) 且 ≤10%
  const gapRatio = validation.missingIds.length / questionCount;
  const canFill = validation.missingIds.length > 0
    && validation.duplicateIds.length === 0
    && validation.outOfRangeIds.length === 0
    && validation.emptyTextIds.length === 0
    && validation.tooShortIds.length === 0
    && gapRatio <= 0.1;

  if (canFill) {
    genState.status = 'filling';
    genState.attempt = 1;
    genState.fillCount = validation.missingIds.length;
    genState.warnings.push('补充 ' + validation.missingIds.length + ' 个缺失问题');

    const fillPrompt = buildFillPrompt(validation.missingIds, block.questions, snapshot);
    try {
      const { content: fillReply, usage: fillUsage } = await callAI(apiKey, endpoint, msgs, versions, activeVersionId,
        questionCount, files, activeFileId, fillPrompt);
      addUsage(fillUsage);
      const fillBlock = parseQuestionsBlock(fillReply);
      let { block: trimmedFill, validation: fillVal } = trimAndValidate(fillBlock, questionCount, genState);
      block = mergeQuestionBlock(block, trimmedFill);
      validation = fillVal;
      genState.actualCount = block.questions.length;

      if (validation.ok) {
        genState.status = 'done';
        const finalReply = block.prefix + '\n' + block.sectionText + '\n' + block.suffix;
        return { finalReply, genState, extraUsage };
      }
    } catch (e) {
      genState.warnings.push('补缺调用失败: ' + String(e));
    }
  }

  // 重试: 结构性问题或补缺失败
  genState.status = 'retrying';
  genState.attempt = 2;
  genState.warnings.push((canFill ? '补缺失败' : '结构性/质量问题') + '，全量重试');

  const retryCtx = buildRetrySystemMsg(validation.reason, questionCount);
  try {
    const { content: retryReply, usage: retryUsage } = await callAI(apiKey, endpoint, msgs, versions, activeVersionId,
      questionCount, files, activeFileId, snapshot, retryCtx);
    addUsage(retryUsage);
    const retryBlock = parseQuestionsBlock(retryReply);
    const { block: trimmedRetry, validation: retryValidation } = trimAndValidate(retryBlock, questionCount, genState);
    genState.actualCount = trimmedRetry.questions.length;

    if (retryValidation.ok) {
      genState.status = 'done';
      return { finalReply: retryReply, genState, extraUsage };
    }
    genState.warnings.push('重试后仍有问题: ' + retryValidation.reason);
  } catch (e) {
    genState.warnings.push('重试调用失败: ' + String(e));
  }

  // 最终失败 — use best available reply with trimmed questions
  genState.status = 'failed';
  let bestReply = reply;
  try { bestReply = block.prefix + '\n' + block.sectionText + '\n' + block.suffix; } catch (_) {}
  const failNote = '\n\n---\n> 已尝试 ' + genState.attempt + ' 次，未达到 ' + questionCount
    + ' 个问题要求（实际 ' + genState.actualCount + ' 个）。'
    + (genState.fillCount > 0 ? ' 已补缺 ' + genState.fillCount + ' 个。' : '');
  return { finalReply: bestReply + failNote, genState, extraUsage };
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
  pendingAction: null,
  questionGen: null,

  setPendingAction: (pa) => set({ pendingAction: pa }),

  confirmAndExec: (id, action) => {
    const pa = get().pendingAction;
    if (pa && pa.id === id && pa.action === action) {
      set({ pendingAction: null });
      if (action === 'reset') get().resetFile(id);
      else if (action === 'delete') get().deleteFile(id);
      else if (action === 'deleteVer') get().deleteVersion(id);
    } else {
      set({ pendingAction: { id, action } });
    }
  },

  selectVersion: (id) => {
    set({ pendingAction: null });
    const versions = get().versions;
    const version = versions.find((v) => v.id === id) as any;
    const isCurrentVersion = get().activeVersionId === id;
    if (!isCurrentVersion) {
      const newLines = versionContent[id] ?? [{ id: 'loading', lineNumber: 1, text: '// 加载中...', type: 'meta', active: true }];
      set({
        versions: versions.map((v) => ({ ...v, active: v.id === id })),
        activeVersionId: id,
        lines: newLines,
        activeLineId: newLines[0]?.id ?? '',
        isReadOnly: version?.locked ?? false,
      });
    } else {
      set({
        versions: versions.map((v) => ({ ...v, active: v.id === id })),
        isReadOnly: version?.locked ?? false,
      });
    }
    // Load version-specific files
    fetch('/api/files?dir=letsgo/versions/' + id)
      .then((r) => r.json())
      .then((data: any[]) => {
        const all = buildFileTree(data);
        const aGroup = all.find((f) => f.id === 'group:a');
        const bGroup = all.find((f) => f.id === 'group:b');
        const defaultFileId = aGroup?.children?.[0]?.id ?? bGroup?.children?.[0]?.id ?? all.find((f) => !f.id.startsWith('group:'))?.id ?? '';
        set({ files: all, activeFileId: defaultFileId });
        if (defaultFileId) get().selectFile(defaultFileId);
      })
      .catch(() => {});
    return; // selectVersion returns void initially, async work continues in background
  },

  selectFile: (id) => {
    set({ pendingAction: null });
    const file = findFileInTree(get().files, id);
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
    const protocolPrefix = '【请在你的回复末尾输出 ```json 协议块，写入文档。】\n\n';
    const augmentedText = text.startsWith('【请在你的回复末尾') ? text : protocolPrefix + text;
    const userMsg: ChatMessage = { id: 'm' + (msgCounter++), role: 'user', content: augmentedText, timestamp: now() };
    console.log('[sendMsg] ========== 用户发送消息 ==========');
    console.log('[sendMsg] 内容长度:', text.length, '当前文件:', activeFileId);
    console.log('[sendMsg] 消息内容:', text.slice(0, 500));
    set((s) => ({ messages: [...s.messages, userMsg], inputText: '', isLoading: true }));

    try {
      const questionCount = get().questionCount;
      // Build current document snapshot from editor lines
      const snapshot = get().lines.map(l => l.text).join('\n');
      const { content: reply, usage: firstUsage } = await callAI(apiKey, get().apiEndpoint, [...get().messages], get().versions, get().activeVersionId, questionCount, get().files, get().activeFileId, snapshot);
      const parsedStage = parseStage(reply);

      // ── 校验门禁 (questionCount > 1 时启用) ──
      let finalReply = reply;
      let genState: QuestionGenState | null = null;
      let totalUsage: TokenUsage = firstUsage ?? { prompt: 0, completion: 0, total: 0 };
      if (questionCount > 1) {
        const result = await ensureQuestionCount(reply, questionCount, snapshot,
          apiKey, get().apiEndpoint, get().messages, get().versions, get().activeVersionId,
          get().files, get().activeFileId);
        finalReply = result.finalReply;
        genState = result.genState;
        // accumulate fill/retry token usage
        if (result.extraUsage) {
          totalUsage = {
            prompt: totalUsage.prompt + result.extraUsage.prompt,
            completion: totalUsage.completion + result.extraUsage.completion,
            total: totalUsage.total + result.extraUsage.total,
          };
        }
      }

      // Strip JSON protocol block from visible text
      const hasJsonBlock = finalReply.includes('```json');
      console.log('[autoWrite] sendMessage: AI 回复长度=', finalReply.length, '包含```json?', hasJsonBlock);
      if (!hasJsonBlock) {
        console.log('[autoWrite] sendMessage: AI 回复末尾 300 字符:', finalReply.slice(-300));
      }
      const visibleText = finalReply.replace(/```json[\s\S]*?```/g, '').trim() || finalReply;
      const newMsgs = [...get().messages, {
        id: 'm' + (msgCounter++), role: 'assistant' as const,
        content: visibleText, timestamp: now(),
        raw: finalReply, protocol: extractProtocol(finalReply),
        usage: totalUsage.total > 0 ? totalUsage : undefined,
        questionGenMeta: genState ? {
          attempted: genState.attempt > 0,
          attemptCount: genState.attempt,
          fillCount: genState.fillCount,
          retryCount: genState.attempt >= 2 ? 1 : 0,
          finalStatus: genState.status === 'done' ? 'success' : 'failed',
          warnings: genState.warnings.join('; '),
        } : undefined,
      }];
      const updates: any = { messages: newMsgs, isLoading: false, questionGen: genState };
      if (parsedStage) {
        updates.versions = get().versions.map((v) => {
          if (v.id === get().activeVersionId) return { ...v, stage: parsedStage } as any;
          return v;
        });
      }
      set(updates);

      // Execute protocol from parsed message
      const protocol = newMsgs[newMsgs.length - 1].protocol;
      console.log('[autoWrite] sendMessage: protocol 存在?', !!protocol);
      if (protocol) {
        if (!protocolHasRequiredFields(protocol)) {
          console.log('[autoWrite] sendMessage: protocol 缺少必填字段, 显示提示');
          set((s) => ({
            messages: [...s.messages, { id: 'm' + (msgCounter++), role: 'assistant' as const, content: 'AI 回复缺少协议块，未执行自动回填。', timestamp: now() }],
          }));
        } else {
          // ── 窄重试：confirmations 非空但 writeActions 为空 → 补写一次 ──
          const writeActions = Array.isArray(protocol.writeActions) ? protocol.writeActions : [];
          const confirmations = Array.isArray(protocol.confirmations) ? protocol.confirmations : [];
          if (writeActions.length === 0 && confirmations.length > 0) {
            console.log('[autoWrite] sendMessage: writeActions 为空但 confirmations 非空, 触发窄重试');
            const fillPrompt = [
              '【紧急补写指令】',
              '上一轮你确认了以下信息但未输出 writeActions：',
              ...confirmations.map((c: string, i: number) => `${i + 1}. ${c}`),
              '',
              '现在只补写 writeActions，不重写整段回复。',
              '输出格式：纯 JSON 数组，每个元素含 targetFile(targetFile 是当前A类文档的文件名，如 "a/01-prd.md")、targetSection、content。',
              '输出示例：',
              '[{ "targetFile": "a/01-prd.md", "targetSection": "2. 背景与概述", "content": "..." }]',
              '不得输出其他文字或代码块标记，只输出 JSON 数组。',
            ].join('\n');
            try {
              const { content: fillReply } = await callAI(apiKey, get().apiEndpoint, [...get().messages], get().versions, get().activeVersionId, questionCount, get().files, get().activeFileId, snapshot, fillPrompt);
              const jsonMatch = fillReply.match(/\[[\s\S]*?\]/);
              if (jsonMatch) {
                const filled = JSON.parse(jsonMatch[0]);
                if (Array.isArray(filled) && filled.length > 0) {
                  protocol.writeActions = filled;
                  console.log('[autoWrite] sendMessage: 窄重试成功, 补写 writeActions count=', filled.length);
                }
              } else {
                console.warn('[autoWrite] sendMessage: 窄重试失败, 未从回复中提取 JSON 数组');
              }
            } catch (e: any) {
              console.warn('[autoWrite] sendMessage: 窄重试异常', e?.message || e);
            }
          }

          console.log('[autoWrite] sendMessage: 100ms 后执行 executeProtocol');
          setTimeout(() => {
            executeProtocol(get(), protocol).catch((err: any) => {
              console.warn('[executeProtocol] failed', err);
              set((s) => ({
                messages: [...s.messages, { id: 'm' + (msgCounter++), role: 'assistant' as const, content: '自动回填失败: ' + (err?.message || String(err)), timestamp: now() }],
              }));
            });
          }, 100);
        }
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
    console.log('[genFiles] generateVersionFiles 开始, versionId=', versionId);
    const v = get().versions.find((x) => x.id === versionId) as any;
    if (!v) { console.log('[genFiles] 版本不存在'); return; }

    const activeFile = findFileInTree(get().files, get().activeFileId);
    console.log('[genFiles] activeFile=', activeFile?.id, 'category=', activeFile?.category);
    if (activeFile?.category === 'a') {
      const content = get().lines.map((l) => l.text).join('\n');
      console.log('[genFiles] 写回 A 文件, content length=', content.length);
      await fetch('/api/files/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: `letsgo/versions/${versionId}/${activeFile.id}`,
          content,
        }),
      });
      console.log('[genFiles] A 文件写回完成');
    }

    const body = JSON.stringify({
      versionId,
      title: v.title,
      messages: get().messages.map((m) => ({ role: m.role, content: m.content })),
      lines: get().lines.map((l) => ({ text: l.text })),
    });
    console.log('[genFiles] 调用 /api/files/generate, lines count=', get().lines.length);
    try {
      const res = await fetch('/api/files/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (!res.ok) throw new Error('生成失败');
      console.log('[genFiles] generate 成功');
      set((s) => ({
        messages: [...s.messages, { id: 'm' + (msgCounter++), role: 'assistant' as const, content: '版本 ' + v.title + ' 的文件已生成。', timestamp: now() }],
      }));
      fetch('/api/files?dir=letsgo/versions/' + versionId)
        .then((r) => r.json())
        .then((data: any[]) => {
          console.log('[genFiles] 重建文件树, 条目数=', data.length);
          set({ files: buildFileTree(data) });
        })
        .catch(() => {});
    } catch (e) {
      console.log('[genFiles] generate 失败', e);
      set((s) => ({
        messages: [...s.messages, { id: 'm' + (msgCounter++), role: 'assistant' as const, content: '文件生成失败。', timestamp: now() }],
      }));
    }
  },

  createFile: async (name) => {
    const fullName = name.endsWith('.md') ? name : name + '.md';
    const verId = get().activeVersionId;
    const dir = 'letsgo/versions/' + verId + '/x';
    try {
      const res = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: fullName, content: '# ' + fullName.replace('.md', '') + '\n\n', dir }),
      });
      if (!res.ok) { const err = await res.json(); alert(err.error || '创建失败'); return; }
      const data = await res.json();
      const newFile: FileItem = { id: 'x/' + data.name, name: data.name, type: data.type as FileItem['type'], category: 'x', createdByUser: true, light: 'gray' };
      const currentFiles = get().files;
      // Add to x-group children, creating group if needed
      let xGroup = currentFiles.find((f) => f.id === 'group:x');
      if (!xGroup) {
        xGroup = { id: 'group:x', name: 'X 自建文档', type: 'folder' as const, category: 'x' as const, children: [] };
        set({ files: [...currentFiles, xGroup], activeFileId: newFile.id });
        xGroup = get().files.find((f) => f.id === 'group:x')!;
      }
      const updated = currentFiles.some(f => f.id === 'group:x')
        ? currentFiles.map((f) => {
            if (f.id === 'group:x' && f.children) return { ...f, children: [...f.children, newFile] };
            return f;
          })
        : [...currentFiles, { id: 'group:x', name: 'X 自建文档', type: 'folder' as const, category: 'x' as const, children: [newFile] }];
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

  resetFile: async (fileId) => {
    console.log('[resetFile] 重置文件:', fileId);
    const files = get().files;
    let file: FileItem | undefined;
    for (const g of files) {
      if (g.children) { file = g.children.find(c => c.id === fileId); if (file) break; }
    }
    if (!file || !file.hasTemplate) { console.log('[resetFile] 文件不存在或没有模板'); return; }
    const verId = get().activeVersionId;
    const relPath = 'letsgo/versions/' + verId + '/' + fileId;
    try {
      // Read template from immutable templates/ directory
      const tplName = fileId.includes('/') ? fileId : 'a/' + fileId;
      const tplPath = 'letsgo/templates/' + tplName;
      console.log('[resetFile] 读取模板:', tplPath);
      const r = await fetch('/api/files?path=' + encodeURIComponent(tplPath));
      const data = await r.json();
      if (!data.lines) { console.log('[resetFile] 模板不存在'); return; }
      const content = data.lines.map((l: any) => l.text).join('\n');
      console.log('[resetFile] 模板内容长度:', content.length);
      await fetch('/api/files/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: relPath, content }),
      });
      console.log('[resetFile] 写入完成, 刷新编辑器');
      get().selectFile(fileId);
    } catch (e) { console.log('[resetFile] 失败', e); alert('重置失败'); }
  },

  deleteFile: async (fileId) => {
    const files = get().files;
    let file: FileItem | undefined;
    for (const g of files) {
      if (g.children) { file = g.children.find(c => c.id === fileId); if (file) break; }
    }
    if (!file || !file.createdByUser) return;
    const verId = get().activeVersionId;
    const relPath = 'letsgo/versions/' + verId + '/' + fileId;
    try {
      const r = await fetch('/api/files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: relPath }),
      });
      if (!r.ok) { alert('删除失败'); return; }
      // Find next file before removing from tree
      const isActive = get().activeFileId === fileId;
      let nextId = get().activeFileId;
      if (isActive) {
        const origGroup = files.find(g => g.children?.some(c => c.id === fileId));
        if (origGroup?.children) {
          const idx = origGroup.children.findIndex(c => c.id === fileId);
          const next = origGroup.children[idx + 1] || origGroup.children[idx - 1];
          nextId = next?.id ?? '';
        }
      }
      // Remove from file tree
      const updated = files.map((g) => {
        if (!g.children) return g;
        return { ...g, children: g.children.filter(c => c.id !== fileId) };
      });
      set({ files: updated, activeFileId: nextId });
      if (nextId && nextId !== fileId) get().selectFile(nextId);
    } catch { alert('删除文件失败'); }
  },

  deleteVersion: async (versionId) => {
    const versions = get().versions;
    if (versions.length <= 1) { alert('至少保留一个版本'); return; }
    try {
      const r = await fetch('/api/versions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId }),
      });
      if (!r.ok) { alert('删除版本失败'); return; }
      // Remove from versions list
      const idx = versions.findIndex((v: any) => v.id === versionId);
      const updated = versions.filter((v: any) => v.id !== versionId);
      const prevIdx = Math.max(0, idx - 1);
      const nextId = updated[prevIdx]?.id ?? '';
      set({ versions: updated, activeVersionId: nextId });
      if (nextId) get().selectVersion(nextId);
    } catch { alert('删除版本失败'); }
  },
}));

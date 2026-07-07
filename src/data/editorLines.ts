export interface EditorLine {
  id: string;
  lineNumber: number;
  text: string;
  type?: 'heading' | 'paragraph' | 'list' | 'code' | 'quote' | 'meta';
  active?: boolean;
}

export const editorLines: EditorLine[] = [
  { id: 'L01', lineNumber: 1, text: '---', type: 'meta' },
  { id: 'L02', lineNumber: 2, text: 'title: AI 项目计划生成系统', type: 'meta' },
  { id: 'L03', lineNumber: 3, text: 'version: 3.1', type: 'meta' },
  { id: 'L04', lineNumber: 4, text: 'status: draft', type: 'meta' },
  { id: 'L05', lineNumber: 5, text: 'purpose: 将用户的模糊或明确想法持续收敛为可落地的软件工程规范文档，并以多轮对话、版本保留、差异记录与本地目录归档的方式长期演进。', type: 'meta' },
  { id: 'L06', lineNumber: 6, text: '---', type: 'meta' },
  { id: 'L07', lineNumber: 7, text: '', type: 'paragraph' },
  { id: 'L08', lineNumber: 8, text: '# AI 项目计划生成系统正式规范', type: 'heading', active: true },
  { id: 'L09', lineNumber: 9, text: '', type: 'paragraph' },
  { id: 'L10', lineNumber: 10, text: '## 1. 总则', type: 'heading' },
  { id: 'L11', lineNumber: 11, text: '', type: 'paragraph' },
  { id: 'L12', lineNumber: 12, text: '### 1.1 文档定位', type: 'heading' },
  { id: 'L13', lineNumber: 13, text: '本文档定义一套把"想法"稳定转化为"可执行、可追溯、可冻结、可归档"的规范系统。它不是一次性方案，也不是单纯的聊天规则，而是一套长期演进的文档治理与版本治理机制。', type: 'paragraph' },
  { id: 'L14', lineNumber: 14, text: '', type: 'paragraph' },
  { id: 'L15', lineNumber: 15, text: '系统的运行主线只有一条：', type: 'paragraph' },
  { id: 'L16', lineNumber: 16, text: '', type: 'paragraph' },
  { id: 'L17', lineNumber: 17, text: '**输入想法 → 识别缺口 → 追问收敛 → 生成版本 → 记录差异 → 冻结归档 → 基于历史派生新版本**', type: 'paragraph' },
  { id: 'L18', lineNumber: 18, text: '', type: 'paragraph' },
  { id: 'L19', lineNumber: 19, text: '本文档负责定义这条主线上的所有规则，包括：', type: 'paragraph' },
  { id: 'L20', lineNumber: 20, text: '- 系统要解决什么问题', type: 'list' },
  { id: 'L21', lineNumber: 21, text: '- 系统边界在哪里', type: 'list' },
  { id: 'L22', lineNumber: 22, text: '- 对话如何收敛为结论', type: 'list' },
  { id: 'L23', lineNumber: 23, text: '- 版本如何生成与流转', type: 'list' },
  { id: 'L24', lineNumber: 24, text: '- 文档如何分层与归档', type: 'list' },
  { id: 'L25', lineNumber: 25, text: '- 差异如何记录与追溯', type: 'list' },
  { id: 'L26', lineNumber: 26, text: '- 冻结如何生效与回退', type: 'list' },
  { id: 'L27', lineNumber: 27, text: '- 模板如何统一与约束', type: 'list' },
];

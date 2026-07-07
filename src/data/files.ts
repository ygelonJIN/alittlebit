export interface FileItem {
  id: string;
  name: string;
  type: 'folder' | 'md' | 'json' | 'log' | 'diff';
  status?: 'normal' | 'draft' | 'frozen' | 'archived';
  active?: boolean;
}

export const files: FileItem[] = [
  { id: 'f1', name: 'AI_项目计划生成系统.md', type: 'md', active: true },
  { id: 'f2', name: 'version_summary.md', type: 'md' },
  { id: 'f3', name: 'change_log.md', type: 'md' },
  { id: 'f4', name: 'question_log.md', type: 'md' },
  { id: 'f5', name: 'confirmation_log.md', type: 'md' },
  { id: 'f6', name: 'diff-v0-to-v1.md', type: 'diff' },
  { id: 'f7', name: 'freeze_summary.md', type: 'md' },
  { id: 'f8', name: 'plan-01 总体计划.md', type: 'md' },
  { id: 'f9', name: 'plan-02 模块A.md', type: 'md' },
  { id: 'f10', name: 'plan-03 模块B.md', type: 'md' },
  { id: 'f11', name: 'plan-04 模块C.md', type: 'md' },
  { id: 'f12', name: 'archive/', type: 'folder' },
];

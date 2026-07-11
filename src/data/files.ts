export interface FileItem {
  id: string;
  name: string;
  type: 'folder' | 'md' | 'json' | 'log' | 'diff';
  status?: 'normal' | 'draft' | 'frozen' | 'archived';
  active?: boolean;
  category?: 'a' | 'b' | 'c' | 'd' | 'x';
  children?: FileItem[];
  light?: 'gray' | 'green' | 'yellow'; // only for A group files
  lockedLight?: boolean;
  hasTemplate?: boolean;
  createdByUser?: boolean;
  templateContent?: string;
}

export const files: FileItem[] = [
  {
    id: 'group:a', name: 'A 核心产出文档', type: 'folder', category: 'a',
    children: [],
  },
  {
    id: 'group:b', name: 'B 治理文档', type: 'folder', category: 'b',
    children: [
      { id: 'f3', name: 'change_log.md', type: 'md', category: 'b' },
      { id: 'f4', name: 'question_log.md', type: 'md', category: 'b' },
      { id: 'f5', name: 'confirmation_log.md', type: 'md', category: 'b' },
      { id: 'f7', name: 'lock_summary.md', type: 'md', category: 'b' },
    ],
  },
  {
    id: 'group:c', name: 'C 差异文档', type: 'folder', category: 'c',
    children: [
      { id: 'f6', name: 'diff_v0_to_v0.md', type: 'diff', category: 'c' },
    ],
  },
];

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  raw?: string;
  protocol?: any;
  usage?: { prompt: number; completion: number; total: number };
  questionGenMeta?: {
    attempted: boolean;
    attemptCount: number;
    fillCount: number;
    retryCount: number;
    finalStatus: 'success' | 'failed';
    warnings: string;
  };
  attachments?: Array<{ name: string; size: number }>;
}

export const messages: ChatMessage[] = [
  { id: 'm1', role: 'assistant', content: '欢迎使用 alittlebit。输入你的想法，我来逐步收敛为可执行的软件工程文档。', timestamp: '10:00' },
];

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export const messages: ChatMessage[] = [
  { id: 'm1', role: 'assistant', content: '我会按 IDE 的方式展示上下文，保持克制、直接、低干扰。', timestamp: '10:00' },
  { id: 'm2', role: 'user', content: '开始', timestamp: '10:01' },
  { id: 'm3', role: 'assistant', content: '收到。现在开始围绕当前 md 文档推进，不再引入多余卡片和装饰。', timestamp: '10:01' },
];

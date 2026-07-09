import { useMemo } from 'react';
import { useStore, calcDocumentProgress, type DocumentProgress } from '../../store';
import './DocumentProgressBar.css';

function getProgressColor(light: string): string {
  switch (light) {
    case 'green': return '#28c840';
    case 'yellow': return '#febc2e';
    default: return '#555';
  }
}

export default function DocumentProgressBar() {
  const lines = useStore((s) => s.lines);
  const files = useStore((s) => s.files);
  const activeFileId = useStore((s) => s.activeFileId);

  const progress: DocumentProgress | null = useMemo(() => {
    if (!activeFileId) return null;
    let file: { id: string; name: string; category?: string; lockedLight?: boolean } | undefined;
    for (const g of files) {
      if (g.id === activeFileId) { file = g; break; }
      if (g.children) { file = g.children.find(c => c.id === activeFileId); if (file) break; }
    }
    if (!file) return null;
    const content = lines.map(l => l.text).join('\n');
    return calcDocumentProgress(content, file.name, !!file.lockedLight, file.category);
  }, [lines, files, activeFileId]);

  if (!progress || !progress.label) return null;

  const color = getProgressColor(progress.light);

  return (
    <div className="doc-progress-bar">
      <div className="progress-track-h">
        <div className="progress-fill-h" style={{ width: `${progress.percent}%`, background: color }} />
      </div>
      <span className="progress-percent-h" style={{ color }}>{progress.percent}%</span>
      <span className="progress-label-h" style={{ color }}>{progress.label}</span>
      <span className="progress-reason-h">{progress.reason}</span>
    </div>
  );
}

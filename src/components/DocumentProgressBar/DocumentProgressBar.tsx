import { useMemo } from 'react';
import { useStore, calcDocumentProgress, type DocumentProgress } from '../../store';
import './DocumentProgressBar.css';

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

  if (!progress || (!progress.label && !progress.reason)) return null;

  return (
    <div className="doc-progress-bar">
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${progress.percent}%` }} />
      </div>
      <span className="progress-pct">{progress.percent}%</span>
      {progress.reason && <span className="progress-label">{progress.reason}</span>}
    </div>
  );
}

import './StatusBar.css';

interface Props {
  isReadOnly: boolean;
  lineNumber?: number;
  colNumber?: number;
  totalLines?: number;
}

export default function StatusBar({ isReadOnly, lineNumber, colNumber, totalLines }: Props) {
  return (
    <div className="status-bar">
      {isReadOnly && <span className="ro-indicator">READ ONLY</span>}
      <span>UTF-8</span>
      <span>Markdown</span>
      {lineNumber != null && <span>Ln {lineNumber}, Col {colNumber ?? 1}</span>}
      {totalLines != null && <span>{totalLines} lines</span>}
    </div>
  );
}

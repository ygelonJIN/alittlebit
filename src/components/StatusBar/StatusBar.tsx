import './StatusBar.css';

interface Props {
  isReadOnly: boolean;
  lineNumber?: number;
  colNumber?: number;
}

export default function StatusBar({ isReadOnly, lineNumber, colNumber }: Props) {
  return (
    <div className="status-bar">
      {isReadOnly && <span className="ro-indicator">READ ONLY</span>}
      <span>UTF-8</span>
      <span>Markdown</span>
      {lineNumber != null && <span>Ln {lineNumber}, Col {colNumber ?? 1}</span>}
    </div>
  );
}

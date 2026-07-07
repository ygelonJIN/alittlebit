import './StatusBar.css';

interface Props {
  isReadOnly: boolean;
}

export default function StatusBar({ isReadOnly }: Props) {
  return (
    <div className="status-bar">
      {isReadOnly && <span className="ro-indicator">READ ONLY</span>}
      <span>UTF-8</span>
      <span>Markdown</span>
    </div>
  );
}

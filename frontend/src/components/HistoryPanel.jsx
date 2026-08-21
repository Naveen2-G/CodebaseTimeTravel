import React from 'react';

export default function HistoryPanel({
  blameData,
  onViewDiff,
  onClose,
  isLoadingDiff
}) {
  if (!blameData) return null;

  const { file, line, commit } = blameData;
  const filesChanged = (commit && commit.filesChanged) || [];

  return (
    <div className="history-panel-container">
      <div className="history-panel-header">
        <h3>HISTORICAL CONTEXT</h3>
        <button className="close-panel-btn" onClick={onClose}>✕</button>
      </div>

      <div className="history-panel-body">
        <div className="context-section">
          <label>File:</label>
          <div className="target-pill">
            <span className="file-name">{file}</span>
          </div>
        </div>

        <div className="context-section">
          <label>Selected line:</label>
          <span className="line-tag">Line {line}</span>
        </div>

        <div className="context-section">
          <label>Introduced by:</label>
          <div className="commit-badge">
            <code>{commit.shortHash || (commit.hash && commit.hash.slice(0, 7))}</code>
          </div>
        </div>

        <div className="context-grid">
          <div className="grid-item">
            <label>Author:</label>
            <span>{commit.author}</span>
          </div>
          <div className="grid-item">
            <label>Date:</label>
            <span>
              {commit.date ? new Date(commit.date).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
              }) : 'N/A'}
            </span>
          </div>
        </div>

        <div className="context-section">
          <label>Commit Message:</label>
          <p className="commit-message-text">"{commit.message}"</p>
        </div>

        {filesChanged.length > 0 && (
          <div className="context-section">
            <label>Files changed ({filesChanged.length}):</label>
            <ul className="files-changed-list">
              {filesChanged.map((f, idx) => (
                <li key={idx}>• {f}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="history-actions">
          <button
            className="view-diff-btn"
            onClick={() => onViewDiff(commit.hash || (blameData.blame && blameData.blame.commit))}
            disabled={isLoadingDiff}
          >
            {isLoadingDiff ? 'Loading Diff...' : '📄 View Diff'}
          </button>
        </div>

        <div className="evidence-footer-note">
          <span>ℹ️ Raw Git Evidence Layer</span>
        </div>
      </div>
    </div>
  );
}

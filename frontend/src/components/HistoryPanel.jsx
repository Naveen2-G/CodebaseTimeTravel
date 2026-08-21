import React from 'react';

export default function HistoryPanel({
  blameData,
  onViewDiff,
  onViewFileHistory,
  onViewEvidence,
  onClose,
  isLoadingDiff,
  isLoadingHistory,
  isLoadingEvidence
}) {
  if (!blameData) return null;

  const { file, line, commit, pullRequests, issues, githubWarning } = blameData;
  const filesChanged = (commit && commit.filesChanged) || [];
  const prList = pullRequests || [];
  const issueList = issues || [];

  return (
    <div className="history-panel-container">
      <div className="history-panel-header">
        <h3>HISTORICAL CONTEXT</h3>
        <button className="close-panel-btn" onClick={onClose}>✕</button>
      </div>

      <div className="history-panel-body">
        {githubWarning && (
          <div className="github-warning-banner">
            ⚠️ {githubWarning}
          </div>
        )}

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

        {/* GitHub Pull Requests Section */}
        <div className="context-section gh-evidence-section">
          <label>Pull Requests:</label>
          {prList.length === 0 ? (
            <div className="no-evidence-text">No related pull request found.</div>
          ) : (
            <div className="evidence-cards-list">
              {prList.map((pr) => (
                <div key={pr.number} className="evidence-card pr-card">
                  <div className="card-top">
                    <span className="pr-number">PR #{pr.number}</span>
                    <span className={`status-pill ${pr.merged ? 'merged' : pr.state}`}>
                      {pr.merged ? 'Merged' : pr.state}
                    </span>
                  </div>
                  <p className="card-title">{pr.title}</p>
                  {pr.url && (
                    <a
                      href={pr.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="open-link-btn"
                    >
                      Open PR ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* GitHub Issues Section */}
        <div className="context-section gh-evidence-section">
          <label>Issues:</label>
          {issueList.length === 0 ? (
            <div className="no-evidence-text">No related issue found.</div>
          ) : (
            <div className="evidence-cards-list">
              {issueList.map((issue) => (
                <div key={issue.number} className="evidence-card issue-card">
                  <div className="card-top">
                    <span className="issue-number">Issue #{issue.number}</span>
                    <span className={`status-pill ${issue.state}`}>
                      {issue.state}
                    </span>
                  </div>
                  <p className="card-title">{issue.title}</p>
                  {issue.url && (
                    <a
                      href={issue.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="open-link-btn"
                    >
                      Open Issue ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="history-actions flex-actions">
          <button
            className="view-evidence-pkg-btn"
            onClick={() => onViewEvidence(file, line)}
            disabled={isLoadingEvidence}
          >
            {isLoadingEvidence ? 'Assembling Package...' : '📦 View Evidence Package'}
          </button>
          <button
            className="view-diff-btn"
            onClick={() => onViewDiff(commit.hash || (blameData.blame && blameData.blame.commit))}
            disabled={isLoadingDiff}
          >
            {isLoadingDiff ? 'Loading Diff...' : '📄 View Diff'}
          </button>
          <button
            className="view-history-btn"
            onClick={() => onViewFileHistory(file)}
            disabled={isLoadingHistory}
          >
            {isLoadingHistory ? 'Loading History...' : '📜 View File History'}
          </button>
        </div>

        <div className="evidence-footer-note">
          <span>ℹ️ Complete Git + GitHub Evidence Layer</span>
        </div>
      </div>
    </div>
  );
}

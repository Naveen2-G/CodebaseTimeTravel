import React, { useState } from 'react';

export default function EvidenceModal({
  evidenceData,
  onClose,
  onViewDiff,
  onExplainCode,
  explanationData,
  isExplaining,
  explanationError
}) {
  const [viewTab, setViewTab] = useState('formatted'); // 'formatted' | 'json'
  const [copySuccess, setCopySuccess] = useState(false);

  if (!evidenceData) return null;

  const {
    repository,
    file,
    selection,
    blame,
    commit,
    diff,
    fileHistory,
    pullRequests,
    issues,
    github
  } = evidenceData;

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(evidenceData, null, 2));
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const isRange = selection && selection.type === 'range';
  const lineLabel = isRange ? 'Lines:' : 'Line:';
  const lineDisplay = selection
    ? isRange
      ? `${selection.startLine}–${selection.endLine}`
      : selection.startLine || selection.line
    : 'N/A';

  const handleExplainClick = () => {
    if (onExplainCode && selection && file) {
      onExplainCode(file.path, selection.startLine || selection.line, selection.endLine || selection.line);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="evidence-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="evidence-modal-header">
          <div className="header-title-group">
            <span className="package-icon">📦</span>
            <h3>EVIDENCE PACKAGE</h3>
            <span className="raw-badge">Pre-AI Fact Layer</span>
          </div>
          <div className="header-actions">
            <div className="tab-switch">
              <button
                className={`tab-btn ${viewTab === 'formatted' ? 'active' : ''}`}
                onClick={() => setViewTab('formatted')}
              >
                Formatted View
              </button>
              <button
                className={`tab-btn ${viewTab === 'json' ? 'active' : ''}`}
                onClick={() => setViewTab('json')}
              >
                Raw JSON
              </button>
            </div>
            <button className="close-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="evidence-modal-body">
          {viewTab === 'formatted' ? (
            <div className="evidence-formatted-content">
              {/* Target File & Code Selection */}
              <div className="evidence-section-box">
                <div className="section-header-flex">
                  <h4 className="section-label">SELECTED CODE (FACTS)</h4>
                  <button
                    className="explain-why-btn"
                    onClick={handleExplainClick}
                    disabled={isExplaining}
                  >
                    {isExplaining ? (
                      <>
                        <span className="spinner-icon">⏳</span> Analyzing evidence...
                      </>
                    ) : (
                      <>✨ Explain Why This Exists</>
                    )}
                  </button>
                </div>

                <div className="evidence-meta-row">
                  <div>
                    <label>File:</label>
                    <code className="highlight-code">{file ? file.path : 'N/A'}</code>
                  </div>
                  <div>
                    <label>{lineLabel}</label>
                    <span className="line-badge">{lineDisplay}</span>
                  </div>
                  <div>
                    <label>Language:</label>
                    <span className="lang-badge">{file ? file.language : 'plaintext'}</span>
                  </div>
                </div>
                <div className="code-snippet-box">
                  <pre>{selection ? selection.code : ''}</pre>
                </div>
              </div>

              {/* AI EXPLANATION SECTION */}
              {isExplaining && (
                <div className="ai-explanation-card loading-state">
                  <div className="ai-loading-header">
                    <span className="ai-spinner">⏳</span>
                    <span>Analyzing repository evidence...</span>
                  </div>
                  <p className="ai-loading-sub">
                    The AI is reasoning from commits, diffs, and GitHub history to explain why this code exists.
                  </p>
                </div>
              )}

              {explanationError && !isExplaining && (
                <div className="ai-explanation-card error-state">
                  <div className="ai-error-header">
                    ⚠️ AI explanation temporarily unavailable.
                  </div>
                  <p className="ai-error-sub">
                    {explanationError}
                  </p>
                </div>
              )}

              {explanationData && !isExplaining && (
                <div className="ai-explanation-card">
                  <div className="ai-card-header">
                    <div className="ai-title-group">
                      <span className="ai-icon">🤖</span>
                      <h4>AI EXPLANATION</h4>
                      <span className="ai-reasoning-badge">AI Reasoning Layer</span>
                    </div>
                    <div className="confidence-pill-container">
                      <span className="confidence-label">CONFIDENCE:</span>
                      <span className={`confidence-badge confidence-${explanationData.confidence}`}>
                        ● {(explanationData.confidence || 'medium').toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <div className="ai-card-body">
                    <div className="ai-section">
                      <h5 className="ai-sub-label">WHAT THIS CODE DOES</h5>
                      <p className="ai-text-content">{explanationData.whatItDoes}</p>
                    </div>

                    <div className="ai-section">
                      <h5 className="ai-sub-label">WHY THIS CODE EXISTS</h5>
                      <p className="ai-text-content why-text">{explanationData.whyItExists}</p>
                    </div>

                    {explanationData.evidence && explanationData.evidence.length > 0 && (
                      <div className="ai-section">
                        <h5 className="ai-sub-label">SUPPORTING EVIDENCE</h5>
                        <ul className="ai-evidence-list">
                          {explanationData.evidence.map((item, idx) => (
                            <li key={idx}>
                              <span className="ev-type-tag">[{item.type || 'evidence'}]</span>{' '}
                              <code className="ev-ref">{item.reference}</code>: {item.description}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Introducing Commit */}
              <div className="evidence-section-box">
                <h4 className="section-label">INTRODUCED BY (FACTS)</h4>
                <div className="meta-grid">
                  <div className="grid-cell">
                    <label>Commit Hash:</label>
                    <code>{commit ? commit.hash : (blame ? blame.commitHash : 'N/A')}</code>
                  </div>
                  <div className="grid-cell">
                    <label>Author:</label>
                    <span>{commit ? commit.author : (blame ? blame.author : 'N/A')}</span>
                  </div>
                  <div className="grid-cell">
                    <label>Date:</label>
                    <span>
                      {commit && commit.date ? new Date(commit.date).toLocaleString() : 'N/A'}
                    </span>
                  </div>
                </div>
                <div className="commit-msg-box">
                  <label>Commit Message:</label>
                  <p>"{commit ? commit.message : ''}"</p>
                </div>
                {diff && diff.available && onViewDiff && (
                  <button
                    className="modal-diff-btn"
                    onClick={() => {
                      onClose();
                      onViewDiff(commit.hash);
                    }}
                  >
                    📄 View Full Commit Diff
                  </button>
                )}
              </div>

              {/* Pull Requests */}
              <div className="evidence-section-box">
                <h4 className="section-label">PULL REQUESTS (FACTS)</h4>
                {!pullRequests || pullRequests.length === 0 ? (
                  <p className="empty-text">No related pull request found.</p>
                ) : (
                  <div className="evidence-items-list">
                    {pullRequests.map((pr) => (
                      <div key={pr.number} className="item-card">
                        <div className="item-header">
                          <strong>PR #{pr.number}</strong>
                          <span className={`status-pill ${pr.merged ? 'merged' : pr.state}`}>
                            {pr.merged ? 'Merged' : pr.state}
                          </span>
                        </div>
                        <p className="item-title">{pr.title}</p>
                        {pr.url && (
                          <a href={pr.url} target="_blank" rel="noopener noreferrer" className="external-link">
                            Open PR ↗
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Issues */}
              <div className="evidence-section-box">
                <h4 className="section-label">ISSUES (FACTS)</h4>
                {!issues || issues.length === 0 ? (
                  <p className="empty-text">No related issue found.</p>
                ) : (
                  <div className="evidence-items-list">
                    {issues.map((issue) => (
                      <div key={issue.number} className="item-card">
                        <div className="item-header">
                          <strong>Issue #{issue.number}</strong>
                          <span className={`status-pill ${issue.state}`}>{issue.state}</span>
                        </div>
                        <p className="item-title">{issue.title}</p>
                        {issue.url && (
                          <a href={issue.url} target="_blank" rel="noopener noreferrer" className="external-link">
                            Open Issue ↗
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* File History Summary */}
              {fileHistory && fileHistory.length > 0 && (
                <div className="evidence-section-box">
                  <h4 className="section-label">FILE HISTORY TIMELINE ({fileHistory.length} COMMITS)</h4>
                  <ul className="history-summary-list">
                    {fileHistory.map((h, i) => (
                      <li key={i}>
                        <code>{h.shortHash || h.hash.slice(0, 7)}</code> — {h.message} ({h.author}, {new Date(h.date).toLocaleDateString()})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="raw-json-container">
              <div className="json-toolbar">
                <button className="copy-json-btn" onClick={handleCopyJson}>
                  {copySuccess ? '✓ Copied to Clipboard!' : '📋 Copy JSON Package'}
                </button>
              </div>
              <pre className="raw-json-pre">
                {JSON.stringify(evidenceData, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

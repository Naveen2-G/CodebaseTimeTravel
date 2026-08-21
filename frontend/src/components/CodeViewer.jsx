import React from 'react';

export default function CodeViewer({
  filePath,
  content,
  lines,
  selectedLine,
  onSelectLine,
  onInvestigateHistory,
  onViewFileHistory,
  isLoadingBlame,
  isLoadingHistory,
  error
}) {
  if (error) {
    return (
      <div className="code-viewer-container empty-state">
        <div className="error-badge">{error}</div>
      </div>
    );
  }

  if (!filePath) {
    return (
      <div className="code-viewer-container empty-state">
        <div className="empty-message">
          <span className="empty-icon">👈</span>
          <p>Select a file from the tree to view its source code</p>
        </div>
      </div>
    );
  }

  const contentLines = (content || '').split('\n');

  return (
    <div className="code-viewer-container">
      <div className="code-viewer-header">
        <span className="file-path-badge">📄 {filePath}</span>
        <div className="header-right-group">
          <span className="file-stats-badge">{lines || contentLines.length} lines</span>
          <button
            className="header-history-btn"
            onClick={() => onViewFileHistory(filePath)}
            disabled={isLoadingHistory}
          >
            {isLoadingHistory ? 'Loading...' : '📜 View File History'}
          </button>
        </div>
      </div>

      {selectedLine && (
        <div className="line-action-bar">
          <span className="selected-line-info">Selected Line <strong>{selectedLine}</strong></span>
          <button
            className="investigate-btn"
            onClick={() => onInvestigateHistory(selectedLine)}
            disabled={isLoadingBlame}
          >
            {isLoadingBlame ? 'Checking Blame...' : '🔍 Investigate History'}
          </button>
        </div>
      )}

      <div className="code-scroll-area">
        <table className="code-table">
          <tbody>
            {contentLines.map((lineText, idx) => {
              const lineNum = idx + 1;
              const isSelected = selectedLine === lineNum;
              return (
                <tr
                  key={lineNum}
                  className={`code-row ${isSelected ? 'selected-row' : ''}`}
                  onClick={() => onSelectLine(lineNum)}
                >
                  <td className="line-number-cell">{lineNum}</td>
                  <td className="line-code-cell">
                    <pre>{lineText || ' '}</pre>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

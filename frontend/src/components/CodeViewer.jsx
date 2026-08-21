import React, { useRef } from 'react';

export default function CodeViewer({
  filePath,
  content,
  lines,
  selection,
  onSelectSelection,
  onInvestigateHistory,
  onViewFileHistory,
  isLoadingBlame,
  isLoadingHistory,
  error
}) {
  const tableRef = useRef(null);

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

  const getSelectedLinesFromDOM = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount || !tableRef.current) return null;

    const rows = tableRef.current.querySelectorAll('tr[data-line]');
    const matchedLines = [];

    rows.forEach((row) => {
      if (sel.containsNode(row, true)) {
        const lineNum = parseInt(row.getAttribute('data-line'), 10);
        if (!isNaN(lineNum)) {
          matchedLines.push(lineNum);
        }
      }
    });

    if (matchedLines.length > 0) {
      const minLine = Math.min(...matchedLines);
      const maxLine = Math.max(...matchedLines);
      return { startLine: minLine, endLine: maxLine, type: minLine === maxLine ? 'line' : 'range' };
    }
    return null;
  };

  const handleMouseUp = () => {
    const domRangeSelection = getSelectedLinesFromDOM();
    if (domRangeSelection && domRangeSelection.startLine !== domRangeSelection.endLine) {
      onSelectSelection(domRangeSelection);
    }
  };

  const handleRowClick = (e, lineNum) => {
    const sel = window.getSelection();

    // If mouse drag resulted in multi-line selection, handleMouseUp handles it
    if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) {
      const domRangeSelection = getSelectedLinesFromDOM();
      if (domRangeSelection && domRangeSelection.startLine !== domRangeSelection.endLine) {
        onSelectSelection(domRangeSelection);
        return;
      }
    }

    // Single line click: clear browser native selection ranges and select single line
    if (sel) {
      sel.removeAllRanges();
    }
    onSelectSelection({ startLine: lineNum, endLine: lineNum, type: 'line' });
  };

  const startLine = selection ? selection.startLine : null;
  const endLine = selection ? selection.endLine : null;
  const isRange = selection && startLine !== endLine;

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

      {selection && (
        <div className="line-action-bar">
          <span className="selected-line-info">
            {isRange ? (
              <>Selected Lines <strong>{startLine}–{endLine}</strong></>
            ) : (
              <>Selected Line <strong>{startLine}</strong></>
            )}
          </span>
          <button
            className="investigate-btn"
            onClick={() => onInvestigateHistory(selection)}
            disabled={isLoadingBlame}
          >
            {isLoadingBlame ? 'Checking Blame...' : '🔍 Investigate History'}
          </button>
        </div>
      )}

      <div className="code-scroll-area" onMouseUp={handleMouseUp}>
        <table className="code-table" ref={tableRef}>
          <tbody>
            {contentLines.map((lineText, idx) => {
              const lineNum = idx + 1;
              const isSelected = selection && lineNum >= startLine && lineNum <= endLine;
              return (
                <tr
                  key={lineNum}
                  data-line={lineNum}
                  className={`code-row ${isSelected ? 'selected-row' : ''}`}
                  onClick={(e) => handleRowClick(e, lineNum)}
                >
                  <td className="line-number-cell" data-line={lineNum} style={{ userSelect: 'none' }}>
                    {lineNum}
                  </td>
                  <td className="line-code-cell" data-line={lineNum}>
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

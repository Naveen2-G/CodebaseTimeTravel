import React from 'react';

export default function DiffModal({ diffData, onClose }) {
  if (!diffData) return null;

  const { commitHash, file, diff } = diffData;
  const diffLines = (diff || '').split('\n');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="diff-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="diff-modal-header">
          <div>
            <h3>Commit Diff Details</h3>
            <span className="diff-meta">Commit: <code>{commitHash ? commitHash.slice(0, 7) : ''}</code> | File: {file}</span>
          </div>
          <button className="close-modal-btn" onClick={onClose}>✕</button>
        </div>

        <div className="diff-modal-body">
          {diffLines.length === 0 ? (
            <div className="empty-diff">No diff available.</div>
          ) : (
            <div className="diff-scroll-area">
              {diffLines.map((line, idx) => {
                let lineType = 'context';
                if (line.startsWith('+') && !line.startsWith('+++')) {
                  lineType = 'addition';
                } else if (line.startsWith('-') && !line.startsWith('---')) {
                  lineType = 'deletion';
                } else if (line.startsWith('@@')) {
                  lineType = 'hunk-header';
                }

                return (
                  <div key={idx} className={`diff-line ${lineType}`}>
                    <pre>{line || ' '}</pre>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

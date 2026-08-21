import React from 'react';

export default function FileHistoryModal({ historyData, onViewDiff, onClose }) {
  if (!historyData) return null;

  const { file, history } = historyData;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="history-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="history-modal-header">
          <div>
            <h3>FILE HISTORY</h3>
            <span className="file-history-subtitle">📄 {file}</span>
          </div>
          <button className="close-modal-btn" onClick={onClose}>✕</button>
        </div>

        <div className="history-modal-body">
          {!history || history.length === 0 ? (
            <div className="empty-history">No commit history found for this file.</div>
          ) : (
            <div className="history-timeline">
              {history.map((item, idx) => {
                const formattedDate = item.date
                  ? new Date(item.date).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })
                  : 'N/A';

                return (
                  <div key={item.hash || idx} className="timeline-node">
                    <div className="timeline-dot">●</div>
                    <div className="timeline-content">
                      <div className="timeline-date">{formattedDate}</div>
                      <div className="timeline-message">"{item.message}"</div>
                      <div className="timeline-author-hash">
                        <span className="author-name">by {item.author}</span>
                        <code className="commit-hash">{item.shortHash || (item.hash && item.hash.slice(0, 7))}</code>
                      </div>
                      <button
                        className="timeline-diff-btn"
                        onClick={() => onViewDiff(item.hash)}
                      >
                        📄 View Diff
                      </button>
                    </div>
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

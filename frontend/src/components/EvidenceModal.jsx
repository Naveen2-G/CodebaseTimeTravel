import React, { useState } from 'react';

export default function EvidenceModal({
  evidenceData,
  onClose,
  onViewDiff,
  onExplainCode,
  onAnalyzeImpact,
  explanationData,
  isExplaining,
  explanationError,
  impactData,
  isAnalyzingImpact,
  impactError
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

  const handleAnalyzeClick = () => {
    if (onAnalyzeImpact && selection && file) {
      onAnalyzeImpact(file.path, selection.startLine || selection.line, selection.endLine || selection.line);
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
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="explain-why-btn"
                      onClick={handleExplainClick}
                      disabled={isExplaining || isAnalyzingImpact}
                    >
                      {isExplaining ? (
                        <>
                          <span className="spinner-icon">⏳</span> Analyzing...
                        </>
                      ) : (
                        <>✨ Explain Why This Exists</>
                      )}
                    </button>
                    <button
                      className="analyze-impact-btn"
                      onClick={handleAnalyzeClick}
                      disabled={isExplaining || isAnalyzingImpact}
                      style={{
                        background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                        color: '#ffffff',
                        border: 'none',
                        padding: '6px 14px',
                        borderRadius: '6px',
                        fontWeight: '600',
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 4px rgba(109, 40, 217, 0.25)'
                      }}
                    >
                      {isAnalyzingImpact ? (
                        <>
                          <span className="spinner-icon">⚡</span> Analyzing repository dependencies...
                        </>
                      ) : (
                        <>⚡ Analyze Impact</>
                      )}
                    </button>
                  </div>
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
                    <span>Analyzing repository evidence & verifying claims...</span>
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
                      
                      {explanationData.verificationStatus === 'passed' && (
                        <span className="verification-badge passed" style={{marginLeft: '8px', fontSize: '11px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '2px 8px', borderRadius: '12px'}}>✓ Evidence Review: Passed</span>
                      )}
                      {explanationData.verificationStatus === 'corrected' && (
                        <span className="verification-badge corrected" style={{marginLeft: '8px', fontSize: '11px', background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '2px 8px', borderRadius: '12px'}}>⚡ Evidence Review: Corrected</span>
                      )}
                      {explanationData.verificationStatus === 'unverified' && (
                        <span className="verification-badge unverified" style={{marginLeft: '8px', fontSize: '11px', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '2px 8px', borderRadius: '12px'}}>⚠️ AI analysis available; verification unavailable</span>
                      )}
                    </div>
                    <div className="confidence-pill-container" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="confidence-label">AI ANALYZER:</span>
                        <span className="confidence-badge" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.3)', fontWeight: '600' }}>
                          {explanationData.analyzerProvider || 'Gemini'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="confidence-label">VERIFICATION:</span>
                        <span className="confidence-badge" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)', fontWeight: '600' }}>
                          {explanationData.verifierProvider || 'OpenRouter'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="confidence-label">HISTORICAL CONFIDENCE:</span>
                        <span className={`confidence-badge confidence-${explanationData.confidence}`}>
                          ● {(explanationData.confidence || 'medium').toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="ai-card-body">
                    <div className="ai-section">
                      <h5 className="ai-sub-label">1. WHAT THIS CODE DOES</h5>
                      <p className="ai-text-content">{explanationData.whatItDoes}</p>
                    </div>

                    <div className="ai-section">
                      <h5 className="ai-sub-label">2. WHY THIS CODE EXISTS</h5>
                      <p className="ai-text-content why-text">{explanationData.whyItExists}</p>
                    </div>

                    {explanationData.whatHistoryProves && (
                      <div className="ai-section">
                        <h5 className="ai-sub-label proves-label">3. WHAT HISTORY PROVES</h5>
                        <p className="ai-text-content proves-text">
                          <span className="bullet-icon">✓</span> {explanationData.whatHistoryProves}
                        </p>
                      </div>
                    )}

                    {explanationData.whatIsInferred && (
                      <div className="ai-section">
                        <h5 className="ai-sub-label inferred-label">4. WHAT IS INFERRED</h5>
                        <p className="ai-text-content inferred-text">
                          <span className="bullet-icon">💡</span> {explanationData.whatIsInferred}
                        </p>
                      </div>
                    )}

                    {explanationData.whatIsUnknown && (
                      <div className="ai-section">
                        <h5 className="ai-sub-label unknown-label">5. WHAT IS UNKNOWN</h5>
                        <p className="ai-text-content unknown-text">
                          <span className="bullet-icon">❓</span> {explanationData.whatIsUnknown}
                        </p>
                      </div>
                    )}

                    {explanationData.evidence && explanationData.evidence.length > 0 && (
                      <div className="ai-section">
                        <h5 className="ai-sub-label">6. SUPPORTING EVIDENCE</h5>
                        <ul className="ai-evidence-list">
                          {explanationData.evidence.map((item, idx) => (
                            <li key={idx}>
                              <span className="ev-type-tag">[{item.type ? item.type.toUpperCase() : 'EVIDENCE'}]</span>{' '}
                              <code className="ev-ref">{item.reference}</code>: {item.description}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* CODE IMPACT ANALYSIS SECTION */}
              {isAnalyzingImpact && (
                <div className="ai-explanation-card loading-state" style={{ borderColor: '#8b5cf6' }}>
                  <div className="ai-loading-header">
                    <span className="ai-spinner">⚡</span>
                    <span>Analyzing repository dependencies...</span>
                  </div>
                  <p className="ai-loading-sub">
                    Traversing callers, imports, routes, and git history to evaluate potential impact...
                  </p>
                </div>
              )}

              {impactError && !isAnalyzingImpact && (
                <div className="ai-explanation-card error-state">
                  <div className="ai-error-header">
                    ⚠️ Impact analysis temporarily unavailable.
                  </div>
                  <p className="ai-error-sub">
                    {impactError}
                  </p>
                </div>
              )}

              {impactData && !isAnalyzingImpact && (
                <div className="ai-explanation-card impact-card" style={{ borderColor: '#8b5cf6', background: 'rgba(139, 92, 246, 0.03)' }}>
                  <div className="ai-card-header">
                    <div className="ai-title-group">
                      <span className="ai-icon">⚡</span>
                      <h4>CODE IMPACT ANALYSIS</h4>
                      <span className="ai-reasoning-badge" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa', border: '1px solid rgba(139, 92, 246, 0.3)' }}>Dependency & Scope Layer</span>
                    </div>

                    <div className="confidence-pill-container" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="confidence-label" style={{ minWidth: '170px' }}>IMPACT LEVEL:</span>
                        <span className={`confidence-badge confidence-${(impactData.impactLevel || 'low').toLowerCase()}`}>
                          ● {(impactData.impactLevel || 'medium').toUpperCase()}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="confidence-label" style={{ minWidth: '170px' }}>IMPACT CONFIDENCE:</span>
                        <span className={`confidence-badge confidence-${(impactData.impactConfidence || 'medium').toLowerCase()}`}>
                          ● {(impactData.impactConfidence || 'medium').toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="ai-card-body">
                    {/* AFFECTED FUNCTIONALITIES */}
                    <div className="ai-section" style={{ borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '14px', marginTop: '14px' }}>
                      <h5 className="ai-sub-label" style={{ color: '#ec4899', fontSize: '13px', letterSpacing: '0.05em' }}>
                        AFFECTED FUNCTIONALITIES
                      </h5>
                      {(!impactData.affectedFunctionalities || impactData.affectedFunctionalities.length === 0) ? (
                        <p className="ai-text-content" style={{ fontStyle: 'italic', opacity: 0.8, color: '#9ca3af' }}>
                          {impactData.noFunctionalityMessage || "No affected application functionality could be established from the available repository evidence."}
                        </p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
                          {impactData.affectedFunctionalities.map((func, idx) => {
                            const relUpper = (func.relationship || 'direct').toUpperCase();
                            const icon = relUpper === 'DIRECT' ? '🔴' : relUpper === 'INDIRECT' ? '🟠' : '🟡';
                            const confUpper = (func.confidence || 'high').toUpperCase();

                            return (
                              <div
                                key={idx}
                                style={{
                                  background: 'rgba(255, 255, 255, 0.04)',
                                  border: '1px solid rgba(255, 255, 255, 0.08)',
                                  borderRadius: '8px',
                                  padding: '12px 14px'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '14px' }}>{icon}</span>
                                    <strong style={{ fontSize: '14px', color: '#f3f4f6' }}>{func.name}</strong>
                                  </div>
                                  <span className={`confidence-badge confidence-${(func.confidence || 'high').toLowerCase()}`} style={{ fontSize: '10px' }}>
                                    CONFIDENCE: {confUpper}
                                  </span>
                                </div>
                                <div style={{ fontSize: '12px', color: '#d1d5db', marginBottom: '4px' }}>
                                  <strong>Relationship:</strong> <span style={{ color: relUpper === 'DIRECT' ? '#f87171' : '#fbbf24', fontWeight: '600' }}>{relUpper}</span>
                                </div>
                                <div style={{ fontSize: '12px', color: '#9ca3af', lineHeight: '1.4' }}>
                                  <strong>Why:</strong> {func.why}
                                </div>
                                {func.evidence && func.evidence.length > 0 && (
                                  <div style={{ marginTop: '8px', fontSize: '11px', color: '#6b7280' }}>
                                    <span style={{ fontWeight: '600' }}>Evidence:</span>
                                    <ul style={{ margin: '2px 0 0 16px', padding: 0 }}>
                                      {func.evidence.map((ev, eIdx) => (
                                        <li key={eIdx}>
                                          <span style={{ textTransform: 'uppercase', color: '#8b5cf6' }}>[{ev.type}]</span> {ev.file}:{ev.line} {ev.snippet && <code>— {ev.snippet}</code>}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* IF THIS CODE IS REMOVED */}
                    <div className="ai-section" style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', padding: '12px 14px' }}>
                      <h5 className="ai-sub-label" style={{ color: '#f87171', margin: 0, marginBottom: '6px' }}>
                        IF THIS CODE IS REMOVED
                      </h5>
                      <p className="ai-text-content" style={{ color: '#fca5a5', margin: 0, fontSize: '13px' }}>
                        ⚠️ {impactData.removalImpact || "Removing this code is not evidenced to directly break registered routes or verified callers."}
                      </p>
                    </div>

                    {/* IF THIS CODE IS MODIFIED */}
                    <div className="ai-section" style={{ background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '8px', padding: '12px 14px' }}>
                      <h5 className="ai-sub-label" style={{ color: '#fbbf24', margin: 0, marginBottom: '6px' }}>
                        IF THIS CODE IS MODIFIED
                      </h5>
                      <p className="ai-text-content" style={{ color: '#fde68a', margin: 0, fontSize: '13px' }}>
                        ⚠️ {impactData.modificationImpact || "Modifying this code affects local file implementation details."}
                      </p>
                    </div>

                    {/* CHANGE ANALYSIS */}
                    <div className="ai-section">
                      <h5 className="ai-sub-label">1. CHANGE ANALYSIS</h5>
                      <p className="ai-text-content">
                        <strong>Change Type:</strong> <span style={{ textTransform: 'uppercase', color: '#a78bfa', fontWeight: 'bold' }}>{impactData.change ? impactData.change.type : 'UNKNOWN'}</span>
                      </p>
                      {impactData.change && impactData.change.commit && (
                        <p className="ai-text-content" style={{ marginTop: '4px', fontSize: '12px', opacity: 0.8 }}>
                          Commit: <code>{impactData.change.commit}</code>
                        </p>
                      )}
                      {impactData.change && impactData.change.message && (
                        <p className="ai-text-content" style={{ marginTop: '4px', fontSize: '12px', opacity: 0.8 }}>
                          Commit message: "{impactData.change.message}"
                        </p>
                      )}
                    </div>

                    {/* DIRECT CALLERS */}
                    <div className="ai-section">
                      <h5 className="ai-sub-label">2. DIRECT CALLERS</h5>
                      {(!impactData.directCallers || impactData.directCallers.length === 0) ? (
                        <p className="ai-text-content" style={{ fontStyle: 'italic', opacity: 0.7 }}>No verified direct callers identified.</p>
                      ) : (
                        <ul className="ai-evidence-list">
                          {impactData.directCallers.map((c, i) => (
                            <li key={i}>
                              <code className="ev-ref">{c.file}:{c.line}</code> {c.snippet && <span style={{ opacity: 0.7 }}> — `{c.snippet}`</span>}
                              {c.evidence && <div style={{ fontSize: '11px', color: '#10b981', marginTop: '2px' }}>✓ {c.evidence}</div>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* POSSIBLE REFERENCES */}
                    <div className="ai-section">
                      <h5 className="ai-sub-label" style={{ color: '#f59e0b' }}>3. POSSIBLE REFERENCES</h5>
                      {(!impactData.possibleReferences || impactData.possibleReferences.length === 0) ? (
                        <p className="ai-text-content" style={{ fontStyle: 'italic', opacity: 0.7 }}>No unverified text matches found.</p>
                      ) : (
                        <ul className="ai-evidence-list">
                          {impactData.possibleReferences.map((pr, i) => (
                            <li key={i}>
                              <code className="ev-ref">{pr.file}:{pr.line}</code> {pr.snippet && <span style={{ opacity: 0.7 }}> — `{pr.snippet}`</span>}
                              {pr.reason && <div style={{ fontSize: '11px', color: '#f59e0b', marginTop: '2px' }}>⚠️ {pr.reason}</div>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* DIRECT DEPENDENCIES */}
                    <div className="ai-section">
                      <h5 className="ai-sub-label">4. DIRECT DEPENDENCIES</h5>
                      {(!impactData.directDependencies || impactData.directDependencies.length === 0) ? (
                        <p className="ai-text-content" style={{ fontStyle: 'italic', opacity: 0.7 }}>No direct dependency identified in selection.</p>
                      ) : (
                        <ul className="ai-evidence-list">
                          {impactData.directDependencies.map((d, i) => (
                            <li key={i}>
                              <span className="ev-type-tag">[{d.type ? d.type.toUpperCase() : 'IMPORT'}]</span> <code>{d.name}</code> {d.source && <span style={{ opacity: 0.7 }}> from '{d.source}'</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* ROUTES / ENDPOINTS */}
                    <div className="ai-section">
                      <h5 className="ai-sub-label">5. ROUTES / ENDPOINTS</h5>
                      {(!impactData.routes || impactData.routes.length === 0) ? (
                        <p className="ai-text-content" style={{ fontStyle: 'italic', opacity: 0.7 }}>No registered web/API route associated with this symbol.</p>
                      ) : (
                        <ul className="ai-evidence-list">
                          {impactData.routes.map((r, i) => (
                            <li key={i} style={{ marginBottom: '8px' }}>
                              <div><span className="ev-type-tag">[{r.method || 'ROUTE'}]</span> <code style={{ fontSize: '13px', fontWeight: 'bold' }}>{r.path}</code></div>
                              {r.handler && <div style={{ fontSize: '11px', color: '#d1d5db', marginTop: '2px' }}><strong>Handler:</strong> <code>{r.handler}</code></div>}
                              {r.definedIn && <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}><strong>Evidence:</strong> {r.definedIn}</div>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* RELATED FILES */}
                    {impactData.relatedFiles && impactData.relatedFiles.length > 0 && (
                      <div className="ai-section">
                        <h5 className="ai-sub-label">6. RELATED FILES</h5>
                        <ul className="ai-evidence-list">
                          {impactData.relatedFiles.map((rf, i) => (
                            <li key={i}>
                              <code>{rf.file}</code> <span style={{ opacity: 0.7 }}>({rf.relationship})</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* HISTORICALLY CO-CHANGED FILES */}
                    <div className="ai-section">
                      <h5 className="ai-sub-label">7. HISTORICALLY CO-CHANGED FILES</h5>
                      {(!impactData.historicallyCoChanged || impactData.historicallyCoChanged.length === 0) ? (
                        <p className="ai-text-content" style={{ fontStyle: 'italic', opacity: 0.7 }}>No co-changed files in introducing commit.</p>
                      ) : (
                        <ul className="ai-evidence-list">
                          {impactData.historicallyCoChanged.map((h, i) => (
                            <li key={i}>
                              <span className="ev-type-tag">[HISTORICAL]</span> <code>{h.file}</code>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* POTENTIAL IMPACT */}
                    <div className="ai-section">
                      <h5 className="ai-sub-label">8. POTENTIAL IMPACT</h5>
                      {Array.isArray(impactData.potentialImpacts) && impactData.potentialImpacts.length > 0 ? (
                        <ul className="ai-evidence-list">
                          {impactData.potentialImpacts.map((pi, i) => (
                            <li key={i} style={{ color: '#e0e7ff' }}>⚠️ {pi}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="ai-text-content">{impactData.potentialImpact || 'No specific impact identified.'}</p>
                      )}
                    </div>
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

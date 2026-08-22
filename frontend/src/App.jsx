import { useState, useEffect } from 'react';
import './App.css';
import FileTree from './components/FileTree';
import CodeViewer from './components/CodeViewer';
import HistoryPanel from './components/HistoryPanel';
import DiffModal from './components/DiffModal';
import FileHistoryModal from './components/FileHistoryModal';
import EvidenceModal from './components/EvidenceModal';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function App() {
  const [backendStatus, setBackendStatus] = useState('checking'); // 'checking' | 'connected' | 'offline'
  const [view, setView] = useState('landing'); // 'landing' | 'explorer'

  // Landing page / Import state
  const [repoUrl, setRepoUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [repoData, setRepoData] = useState(null);

  // Explorer view state
  const [fileTree, setFileTree] = useState([]);
  const [isLoadingTree, setIsLoadingTree] = useState(false);

  const [selectedFilePath, setSelectedFilePath] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [fileLines, setFileLines] = useState(0);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [fileError, setFileError] = useState('');

  // selection state: { startLine: number, endLine: number, type: 'line'|'range' }
  const [selection, setSelection] = useState(null);
  const [blameData, setBlameData] = useState(null);
  const [isLoadingBlame, setIsLoadingBlame] = useState(false);

  const [diffData, setDiffData] = useState(null);
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);

  const [fileHistoryData, setFileHistoryData] = useState(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const [evidenceData, setEvidenceData] = useState(null);
  const [isLoadingEvidence, setIsLoadingEvidence] = useState(false);

  // AI Explanation State
  const [explanationData, setExplanationData] = useState(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [explanationError, setExplanationError] = useState(null);

  // Impact Analysis State
  const [impactData, setImpactData] = useState(null);
  const [isAnalyzingImpact, setIsAnalyzingImpact] = useState(false);
  const [impactError, setImpactError] = useState(null);

  const checkHealth = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/health`);
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'ok' || data.success === true) {
          setBackendStatus('connected');
        } else {
          setBackendStatus('offline');
        }
      } else {
        setBackendStatus('offline');
      }
    } catch (error) {
      setBackendStatus('offline');
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleImport = async (e) => {
    e.preventDefault();
    setImportError('');
    setRepoData(null);

    if (!repoUrl || !repoUrl.trim()) {
      setImportError('Please enter a GitHub repository URL.');
      return;
    }

    const githubRegex = /^https:\/\/(www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\.git)?\/?$/;
    if (!githubRegex.test(repoUrl.trim())) {
      setImportError('Please enter a valid GitHub repository URL.');
      return;
    }

    if (backendStatus === 'offline') {
      setImportError('Unable to import repository. Backend server is offline.');
      return;
    }

    setIsImporting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/repository/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: repoUrl.trim() }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setImportError(data.error || 'Could not import repository. Please check the URL and try again.');
      } else {
        setRepoData(data.repository);
      }
    } catch (err) {
      setImportError('Unable to import repository. Please check server connection.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleExploreCodebase = async () => {
    if (!repoData || !repoData.id) return;
    setView('explorer');
    setIsLoadingTree(true);
    setFileError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/repository/${repoData.id}/files`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        setFileError(data.error || 'Failed to load file tree.');
      } else {
        setFileTree(data.tree || []);
      }
    } catch (err) {
      setFileError('Failed to load file tree. Server error.');
    } finally {
      setIsLoadingTree(false);
    }
  };

  const handleSelectFile = async (filePath) => {
    setSelectedFilePath(filePath);
    setSelection(null);
    setBlameData(null);
    setFileError('');
    setIsLoadingFile(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/repository/${repoData.id}/file?path=${encodeURIComponent(filePath)}`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        setFileError(data.error || 'Failed to load file content.');
        setFileContent('');
        setFileLines(0);
      } else {
        setFileContent(data.content || '');
        setFileLines(data.lines || 0);
      }
    } catch (err) {
      setFileError('Error loading file content.');
    } finally {
      setIsLoadingFile(false);
    }
  };

  const handleSelectSelection = (selObj) => {
    setSelection(selObj);
  };

  const handleInvestigateHistory = async (selObj) => {
    const currentSel = selObj || selection;
    if (!selectedFilePath || !currentSel || !repoData) return;

    const sLine = currentSel.startLine || currentSel.line;
    const eLine = currentSel.endLine || sLine;

    setIsLoadingBlame(true);
    setBlameData(null);

    try {
      // 1. Fetch Git blame for selected line range
      const response = await fetch(
        `${API_BASE_URL}/api/repository/${repoData.id}/blame?path=${encodeURIComponent(selectedFilePath)}&startLine=${sLine}&endLine=${eLine}`
      );
      const data = await response.json();

      if (!response.ok || !data.success) {
        alert(data.error || 'Git blame failed for selected line range.');
        return;
      }

      // 2. Fetch GitHub PR and Issue context for primary commit
      const commitHash = data.commit ? data.commit.hash : (data.blame ? data.blame.commit : null);
      if (commitHash) {
        try {
          const ctxRes = await fetch(`${API_BASE_URL}/api/repository/${repoData.id}/commit/${commitHash}/context`);
          if (ctxRes.ok) {
            const ctxData = await ctxRes.json();
            if (ctxData.success) {
              data.pullRequests = ctxData.pullRequests || [];
              data.issues = ctxData.issues || [];
              data.githubAvailable = ctxData.githubAvailable;
              data.githubWarning = ctxData.warning;
            }
          }
        } catch (ctxErr) {
          console.warn('Could not fetch GitHub context:', ctxErr);
        }
      }

      setBlameData(data);
    } catch (err) {
      alert('Error performing Git blame.');
    } finally {
      setIsLoadingBlame(false);
    }
  };

  const handleViewDiff = async (commitHash) => {
    if (!commitHash || !repoData) return;
    setIsLoadingDiff(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/repository/${repoData.id}/commit/${commitHash}/diff?path=${encodeURIComponent(selectedFilePath || '')}`
      );
      const data = await response.json();

      if (!response.ok || !data.success) {
        alert(data.error || 'Failed to load commit diff.');
      } else {
        setDiffData(data);
      }
    } catch (err) {
      alert('Error fetching commit diff.');
    } finally {
      setIsLoadingDiff(false);
    }
  };

  const handleViewFileHistory = async (filePath) => {
    const targetFile = filePath || selectedFilePath;
    if (!targetFile || !repoData) return;
    setIsLoadingHistory(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/repository/${repoData.id}/history?path=${encodeURIComponent(targetFile)}`
      );
      const data = await response.json();

      if (!response.ok || !data.success) {
        alert(data.error || 'Failed to fetch file history.');
      } else {
        setFileHistoryData(data);
      }
    } catch (err) {
      alert('Error fetching file history.');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleViewEvidencePackage = async (filePath, selObj) => {
    const targetFile = filePath || selectedFilePath;
    const currentSel = selObj || selection;
    if (!targetFile || !currentSel || !repoData) return;

    const sLine = currentSel.startLine || currentSel.line;
    const eLine = currentSel.endLine || sLine;

    setIsLoadingEvidence(true);
    setExplanationData(null);
    setExplanationError(null);
    setImpactData(null);
    setImpactError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/repository/${repoData.id}/evidence?filePath=${encodeURIComponent(targetFile)}&startLine=${sLine}&endLine=${eLine}`
      );
      const data = await response.json();

      if (!response.ok || !data.success) {
        alert(data.error || 'Failed to assemble evidence package.');
      } else {
        setEvidenceData(data);
      }
    } catch (err) {
      alert('Error building evidence package.');
    } finally {
      setIsLoadingEvidence(false);
    }
  };

  const handleExplainCode = async (filePath, startLine, endLine) => {
    const targetFile = filePath || selectedFilePath;
    const currentSel = selection || { startLine, endLine };
    if (!targetFile || !repoData) return;

    const sLine = startLine || (currentSel ? currentSel.startLine : 1);
    const eLine = endLine || (currentSel ? currentSel.endLine : sLine);

    setIsExplaining(true);
    setExplanationError(null);
    setExplanationData(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/repository/${repoData.id}/explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: targetFile,
          startLine: sLine,
          endLine: eLine
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setExplanationError(data.error || 'AI explanation temporarily unavailable.');
      } else {
        setExplanationData(data.explanation);
      }
    } catch (err) {
      setExplanationError('AI explanation temporarily unavailable.');
    } finally {
      setIsExplaining(false);
    }
  };

  const handleAnalyzeImpact = async (filePath, startLine, endLine) => {
    const targetFile = filePath || selectedFilePath;
    const currentSel = selection || { startLine, endLine };
    if (!targetFile || !repoData) return;

    const sLine = startLine || (currentSel ? currentSel.startLine : 1);
    const eLine = endLine || (currentSel ? currentSel.endLine : sLine);

    setIsAnalyzingImpact(true);
    setImpactError(null);
    setImpactData(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/repository/${repoData.id}/explain-impact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: targetFile,
          startLine: sLine,
          endLine: eLine
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setImpactError(data.error || 'Impact analysis temporarily unavailable.');
      } else {
        setImpactData(data.impactEvidence);
        if (data.explanation) {
          setExplanationData(data.explanation);
        }
      }
    } catch (err) {
      setImpactError('Impact analysis temporarily unavailable.');
    } finally {
      setIsAnalyzingImpact(false);
    }
  };

  return (
    <div className="app-container">
      <header className="navbar">
        <div className="logo-section" onClick={() => setView('landing')} style={{ cursor: 'pointer' }}>
          <span className="logo-icon">⏳</span>
          <span className="logo-text">Codebase Time Traveler</span>
        </div>
        <div className="status-container">
          <span className="status-label">Backend:</span>
          {backendStatus === 'checking' && <span className="status-badge checking">🟡 Checking...</span>}
          {backendStatus === 'connected' && <span className="status-badge connected">🟢 Connected</span>}
          {backendStatus === 'offline' && <span className="status-badge offline">🔴 Backend Offline</span>}
        </div>
      </header>

      {view === 'landing' ? (
        <main className="hero-section">
          <div className="badge-pill">Dev Tool MVP</div>
          <h1 className="main-title">Codebase Time Traveler</h1>
          <p className="subtitle">Understand why your code exists.</p>

          <form onSubmit={handleImport} className="search-box">
            <input
              type="text"
              className="repo-input"
              placeholder="https://github.com/username/repository"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              disabled={isImporting}
            />
            <button type="submit" className="import-btn" disabled={isImporting}>
              {isImporting ? 'Importing...' : 'Import Repository'}
            </button>
          </form>

          {isImporting && (
            <div className="loading-box">
              <p className="loading-title">Importing repository...</p>
              <p className="loading-sub">Please wait.</p>
            </div>
          )}

          {importError && (
            <div className="error-box">
              <p>{importError}</p>
            </div>
          )}

          {repoData && (
            <div className="repo-card">
              <div className="repo-card-header">
                <span className="success-badge">Repository imported ✓</span>
              </div>
              <h2 className="repo-name">{repoData.name}</h2>

              <div className="repo-stats">
                <div className="stat-pill">
                  <span className="stat-value">{repoData.files}</span>
                  <span className="stat-label">Files</span>
                </div>
                <div className="stat-pill">
                  <span className="stat-value">{repoData.commits}</span>
                  <span className="stat-label">Commits</span>
                </div>
              </div>

              {repoData.latestCommit && (
                <div className="latest-commit-box">
                  <span className="commit-header">Latest Commit:</span>
                  <p className="commit-msg">"{repoData.latestCommit.message}"</p>
                </div>
              )}

              <button className="explore-btn active-explore" onClick={handleExploreCodebase}>
                Explore Codebase →
              </button>
            </div>
          )}
        </main>
      ) : (
        <div className="explorer-view">
          <div className="explorer-sub-header">
            <button className="back-btn" onClick={() => setView('landing')}>
              ← Back
            </button>
            <div className="explorer-title-info">
              <span className="repo-label">Repository:</span>
              <strong className="repo-name-text">{repoData ? repoData.name : 'Codebase'}</strong>
            </div>
          </div>

          <div className="explorer-workspace">
            <aside className="file-tree-sidebar">
              {isLoadingTree ? (
                <div className="sidebar-loading">Loading file tree...</div>
              ) : (
                <FileTree
                  tree={fileTree}
                  onSelectFile={handleSelectFile}
                  selectedFilePath={selectedFilePath}
                />
              )}
            </aside>

            <main className="code-viewer-main">
              {isLoadingFile ? (
                <div className="code-loading-overlay">Loading file content...</div>
              ) : (
                <CodeViewer
                  filePath={selectedFilePath}
                  content={fileContent}
                  lines={fileLines}
                  selection={selection}
                  onSelectSelection={handleSelectSelection}
                  onInvestigateHistory={handleInvestigateHistory}
                  onViewFileHistory={handleViewFileHistory}
                  isLoadingBlame={isLoadingBlame}
                  isLoadingHistory={isLoadingHistory}
                  error={fileError}
                />
              )}
            </main>

            {blameData && (
              <HistoryPanel
                blameData={blameData}
                onViewDiff={handleViewDiff}
                onViewFileHistory={handleViewFileHistory}
                onViewEvidence={handleViewEvidencePackage}
                onClose={() => setBlameData(null)}
                isLoadingDiff={isLoadingDiff}
                isLoadingHistory={isLoadingHistory}
                isLoadingEvidence={isLoadingEvidence}
              />
            )}
          </div>

          {diffData && (
            <DiffModal
              diffData={diffData}
              onClose={() => setDiffData(null)}
            />
          )}

          {fileHistoryData && (
            <FileHistoryModal
              historyData={fileHistoryData}
              onViewDiff={handleViewDiff}
              onClose={() => setFileHistoryData(null)}
            />
          )}

          {evidenceData && (
            <EvidenceModal
              evidenceData={evidenceData}
              onClose={() => setEvidenceData(null)}
              onViewDiff={handleViewDiff}
              onExplainCode={handleExplainCode}
              onAnalyzeImpact={handleAnalyzeImpact}
              explanationData={explanationData}
              isExplaining={isExplaining}
              explanationError={explanationError}
              impactData={impactData}
              isAnalyzingImpact={isAnalyzingImpact}
              impactError={impactError}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default App;

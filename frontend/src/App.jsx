import { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [backendStatus, setBackendStatus] = useState('checking'); // 'checking' | 'connected' | 'offline'
  const [repoUrl, setRepoUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [repoData, setRepoData] = useState(null);

  const checkHealth = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/health');
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'ok') {
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
    setErrorMsg('');
    setRepoData(null);

    // Client-side validation
    if (!repoUrl || !repoUrl.trim()) {
      setErrorMsg('Please enter a GitHub repository URL.');
      return;
    }

    const githubRegex = /^https:\/\/(www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\.git)?\/?$/;
    if (!githubRegex.test(repoUrl.trim())) {
      setErrorMsg('Please enter a valid GitHub repository URL.');
      return;
    }

    if (backendStatus === 'offline') {
      setErrorMsg('Unable to import repository. Backend server is offline.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:5000/api/repository/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: repoUrl.trim() }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setErrorMsg(data.error || 'Could not import repository. Please check the URL and try again.');
      } else {
        setRepoData(data.repository);
      }
    } catch (err) {
      setErrorMsg('Unable to import repository. Please check server connection.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      <header className="navbar">
        <div className="logo-section">
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
            disabled={isLoading}
          />
          <button type="submit" className="import-btn" disabled={isLoading}>
            {isLoading ? 'Importing...' : 'Import Repository'}
          </button>
        </form>

        {isLoading && (
          <div className="loading-box">
            <p className="loading-title">Importing repository...</p>
            <p className="loading-sub">Please wait.</p>
          </div>
        )}

        {errorMsg && (
          <div className="error-box">
            <p>{errorMsg}</p>
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

            <button className="explore-btn" disabled>
              Explore Codebase
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;



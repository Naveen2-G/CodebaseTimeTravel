import { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [backendStatus, setBackendStatus] = useState('checking'); // 'checking' | 'connected' | 'offline'
  const [repoUrl, setRepoUrl] = useState('');
  const [importNotice, setImportNotice] = useState('');

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

  const handleImport = (e) => {
    e.preventDefault();
    if (!repoUrl.trim()) return;
    setImportNotice(`Repository submitted: ${repoUrl}`);
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
          />
          <button type="submit" className="import-btn">
            Import Repository
          </button>
        </form>

        {importNotice && (
          <div className="notice-box">
            {importNotice}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;


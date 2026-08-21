const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const repositoryRoutes = require('./routes/repositoryRoutes');
const historyRoutes = require('./routes/historyRoutes');
const githubService = require('./services/githubService');

const app = express();
const PORT = 5000;

// Safe Startup Diagnostic Log (never logs token value)
console.log("GitHub token configured:", Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim()));

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Codebase Time Traveler backend is running'
  });
});

// Diagnostic GitHub API status endpoint
app.get('/api/github/status', async (req, res) => {
  try {
    const status = await githubService.checkGitHubStatus();
    res.json({
      success: true,
      ...status
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Failed to verify GitHub status'
    });
  }
});

// Repository & History routes
app.use('/api/repository', repositoryRoutes);
app.use('/api/repository', historyRoutes);
app.use('/api/history', historyRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

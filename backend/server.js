const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const repositoryRoutes = require('./routes/repositoryRoutes');
const historyRoutes = require('./routes/historyRoutes');
const githubService = require('./services/githubService');

const app = express();
const PORT = process.env.PORT || 5000;

// Safe Startup Diagnostic Log (never logs token value)
console.log("GitHub token configured:", Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim()));

// CORS Middleware (supports production FRONTEND_URL and dev origins)
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    return callback(null, true);
  }
}));
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    service: 'codebase-time-traveler',
    status: 'ok'
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
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT} (0.0.0.0)`);
});

const express = require('express');
const cors = require('cors');
const repositoryRoutes = require('./routes/repositoryRoutes');
const historyRoutes = require('./routes/historyRoutes');

const app = express();
const PORT = 5000;

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

// Repository & History routes
app.use('/api/repository', repositoryRoutes);
app.use('/api/repository', historyRoutes);
app.use('/api/history', historyRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});



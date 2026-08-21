const express = require('express');
const router = express.Router();
const gitHistoryService = require('../services/gitHistoryService');

// GET /api/repository/:repositoryId/blame?path=...&line=...
router.get('/:repositoryId/blame', async (req, res) => {
  try {
    const { repositoryId } = req.params;
    const filePath = req.query.path;
    const lineNumber = req.query.line;
    const result = await gitHistoryService.getGitBlame(repositoryId, filePath, lineNumber);
    return res.status(200).json(result);
  } catch (err) {
    const statusCode = err.status || 500;
    const message = err.message || 'Git blame failed.';
    return res.status(statusCode).json({
      success: false,
      error: message
    });
  }
});

// GET /api/repository/:repositoryId/commit/:commitHash
router.get('/:repositoryId/commit/:commitHash', async (req, res) => {
  try {
    const { repositoryId, commitHash } = req.params;
    const result = await gitHistoryService.getCommitDetails(repositoryId, commitHash);
    return res.status(200).json(result);
  } catch (err) {
    const statusCode = err.status || 500;
    const message = err.message || 'Commit details could not be retrieved.';
    return res.status(statusCode).json({
      success: false,
      error: message
    });
  }
});

// GET /api/repository/:repositoryId/diff/:commitHash
router.get('/:repositoryId/diff/:commitHash', async (req, res) => {
  try {
    const { repositoryId, commitHash } = req.params;
    const filePath = req.query.path;
    const result = await gitHistoryService.getCommitDiff(repositoryId, commitHash, filePath);
    return res.status(200).json(result);
  } catch (err) {
    const statusCode = err.status || 500;
    const message = err.message || 'Commit diff could not be generated.';
    return res.status(statusCode).json({
      success: false,
      error: message
    });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const gitHistoryService = require('../services/gitHistoryService');
const repositoryService = require('../services/repositoryService');
const githubService = require('../services/githubService');
const evidenceService = require('../services/evidenceService');
const aiService = require('../services/aiService');

// POST /api/repository/:repositoryId/explain
router.post('/:repositoryId/explain', async (req, res) => {
  try {
    const { repositoryId } = req.params;
    const { filePath, startLine, endLine, line } = req.body || {};

    const targetFile = filePath;
    const sLine = startLine || line;
    const eLine = endLine || sLine;

    if (!repositoryId) {
      return res.status(400).json({ success: false, error: 'Repository ID is required.' });
    }
    if (!targetFile) {
      return res.status(400).json({ success: false, error: 'File path is required.' });
    }
    if (!sLine) {
      return res.status(400).json({ success: false, error: 'Start line is required.' });
    }

    // 1. Server-side Evidence Package assembly (Facts Layer)
    const evidencePackage = await evidenceService.buildEvidencePackage(repositoryId, targetFile, sLine, eLine);

    // 2. Call AI explanation service using Gemini
    const aiResult = await aiService.generateExplanation(evidencePackage);

    return res.status(200).json({
      success: true,
      explanation: aiResult.explanation
    });
  } catch (err) {
    console.error('AI Explanation Endpoint Error:', err.message || err);
    const statusCode = err.status || 500;
    const message = err.message || 'AI explanation temporarily unavailable.';
    return res.status(statusCode).json({
      success: false,
      error: message
    });
  }
});

// GET /api/repository/:repositoryId/evidence?filePath=...&line=...&startLine=...&endLine=...
router.get('/:repositoryId/evidence', async (req, res) => {
  try {
    const { repositoryId } = req.params;
    const filePath = req.query.filePath || req.query.path;
    const startLine = req.query.startLine || req.query.line;
    const endLine = req.query.endLine || startLine;
    const result = await evidenceService.buildEvidencePackage(repositoryId, filePath, startLine, endLine);
    return res.status(200).json(result);
  } catch (err) {
    const statusCode = err.status || 500;
    const message = err.message || 'Failed to assemble evidence package.';
    return res.status(statusCode).json({
      success: false,
      error: message
    });
  }
});

// GET /api/repository/:repositoryId/blame?path=...&line=...&startLine=...&endLine=...
router.get('/:repositoryId/blame', async (req, res) => {
  try {
    const { repositoryId } = req.params;
    const filePath = req.query.path;
    const startLine = req.query.startLine || req.query.line;
    const endLine = req.query.endLine || startLine;
    const result = await gitHistoryService.getGitBlame(repositoryId, filePath, startLine, endLine);
    return res.status(200).json(result);
  } catch (err) {
    const statusCode = err.status || 500;
    const message = err.message || 'Unable to determine the history of this line range.';
    return res.status(statusCode).json({
      success: false,
      error: message
    });
  }
});

// GET /api/repository/:repositoryId/history?path=...
router.get('/:repositoryId/history', async (req, res) => {
  try {
    const { repositoryId } = req.params;
    const filePath = req.query.path;
    const result = await gitHistoryService.getFileHistory(repositoryId, filePath);
    return res.status(200).json(result);
  } catch (err) {
    const statusCode = err.status || 500;
    const message = err.message || 'File history unavailable.';
    return res.status(statusCode).json({
      success: false,
      error: message
    });
  }
});

// GET /api/repository/:repositoryId/commit/:commitHash/context
router.get('/:repositoryId/commit/:commitHash/context', async (req, res) => {
  try {
    const { repositoryId, commitHash } = req.params;

    // 1. Local Git commit details
    const commitDetails = await gitHistoryService.getCommitDetails(repositoryId, commitHash);

    // 2. Repository metadata (owner & repo name)
    const meta = await repositoryService.getRepoMetadata(repositoryId);

    // 3. GitHub PR & Issue evidence
    let githubContext = { pullRequests: [], issues: [], githubAvailable: false };
    if (meta && meta.owner && meta.repo) {
      githubContext = await githubService.getCommitGitHubContext(meta.owner, meta.repo, commitHash);
    }

    return res.status(200).json({
      success: true,
      commit: commitDetails.commit,
      pullRequests: githubContext.pullRequests || [],
      issues: githubContext.issues || [],
      githubAvailable: Boolean(githubContext.githubAvailable),
      warning: githubContext.warning || null
    });
  } catch (err) {
    const statusCode = err.status || 500;
    const message = err.message || 'Unable to retrieve commit context.';
    return res.status(statusCode).json({
      success: false,
      error: message
    });
  }
});

// GET /api/repository/:repositoryId/commit/:commitHash/diff
router.get('/:repositoryId/commit/:commitHash/diff', async (req, res) => {
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

const express = require('express');
const router = express.Router();
const repositoryService = require('../services/repositoryService');

// POST /api/repository/import
router.post('/import', async (req, res) => {
  try {
    const { url } = req.body || {};
    const result = await repositoryService.importRepository(url);
    return res.status(200).json(result);
  } catch (err) {
    const statusCode = err.status || 500;
    const message = err.message || 'Unable to import repository.';
    return res.status(statusCode).json({
      success: false,
      error: message
    });
  }
});

// GET /api/repository/:repositoryId/files
router.get('/:repositoryId/files', async (req, res) => {
  try {
    const { repositoryId } = req.params;
    const result = await repositoryService.getFileTree(repositoryId);
    return res.status(200).json(result);
  } catch (err) {
    const statusCode = err.status || 500;
    const message = err.message || 'Unable to load file tree.';
    return res.status(statusCode).json({
      success: false,
      error: message
    });
  }
});

// GET /api/repository/:repositoryId/file?path=...
router.get('/:repositoryId/file', async (req, res) => {
  try {
    const { repositoryId } = req.params;
    const filePath = req.query.path;
    const result = await repositoryService.getFileContent(repositoryId, filePath);
    return res.status(200).json(result);
  } catch (err) {
    const statusCode = err.status || 500;
    const message = err.message || 'Unable to load file content.';
    return res.status(statusCode).json({
      success: false,
      error: message
    });
  }
});

module.exports = router;

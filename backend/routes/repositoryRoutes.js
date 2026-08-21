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

module.exports = router;

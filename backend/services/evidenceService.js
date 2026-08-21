const path = require('path');
const repositoryService = require('./repositoryService');
const gitHistoryService = require('./gitHistoryService');
const githubService = require('./githubService');

/**
 * Infer programming / config language from file extension
 */
function detectLanguage(filePath) {
  if (!filePath) return 'plaintext';
  const ext = path.extname(filePath).toLowerCase();
  const langMap = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.java': 'java',
    '.rb': 'ruby',
    '.go': 'go',
    '.rs': 'rust',
    '.php': 'php',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.cs': 'csharp',
    '.html': 'html',
    '.css': 'css',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.md': 'markdown',
    '.sh': 'shell',
    '.ps1': 'powershell',
    '.sql': 'sql',
    '.dockerfile': 'dockerfile'
  };

  if (filePath.toLowerCase().endsWith('dockerfile')) return 'dockerfile';
  return langMap[ext] || 'plaintext';
}

/**
 * Build unified Evidence Package for a selected line in a file
 */
async function buildEvidencePackage(repositoryId, relativePath, lineNumber) {
  const lineNum = parseInt(lineNumber, 10);
  if (isNaN(lineNum) || lineNum <= 0) {
    throw { status: 400, message: 'Invalid line number. Must be a positive integer.' };
  }

  // 1. Get repository metadata
  const meta = await repositoryService.getRepoMetadata(repositoryId);

  // 2. Read file content to extract the code at line
  let fileContentObj;
  try {
    fileContentObj = await repositoryService.getFileContent(repositoryId, relativePath);
  } catch (err) {
    throw { status: err.status || 500, message: err.message || 'Unable to read file content for evidence.' };
  }

  const contentLines = (fileContentObj.content || '').split('\n');
  if (lineNum > contentLines.length) {
    throw { status: 400, message: `Line number ${lineNum} exceeds total lines (${contentLines.length}) in file.` };
  }

  const selectedCode = contentLines[lineNum - 1] || '';
  const language = detectLanguage(relativePath);

  // 3. Git blame for selected line
  let blameData;
  try {
    blameData = await gitHistoryService.getGitBlame(repositoryId, relativePath, lineNum);
  } catch (err) {
    throw { status: err.status || 500, message: err.message || 'Git blame failed while building evidence package.' };
  }

  const commitHash = blameData.commit ? blameData.commit.hash : (blameData.blame ? blameData.blame.commit : null);

  // 4. Commit details
  let commitDetails = {
    hash: commitHash || '',
    shortHash: commitHash ? commitHash.slice(0, 7) : '',
    message: blameData.commit ? blameData.commit.message : '',
    author: blameData.commit ? blameData.commit.author : '',
    date: blameData.commit ? blameData.commit.date : '',
    filesChanged: (blameData.commit && blameData.commit.filesChanged) || []
  };

  if (commitHash && (!commitDetails.message || commitDetails.filesChanged.length === 0)) {
    try {
      const fullCommitObj = await gitHistoryService.getCommitDetails(repositoryId, commitHash);
      if (fullCommitObj && fullCommitObj.commit) {
        commitDetails = fullCommitObj.commit;
      }
    } catch (_) {}
  }

  // 5. Commit diff
  let diffObj = { available: false, content: null };
  if (commitHash) {
    try {
      const diffRes = await gitHistoryService.getCommitDiff(repositoryId, commitHash, relativePath);
      if (diffRes && diffRes.success && diffRes.diff) {
        diffObj = {
          available: true,
          content: diffRes.diff
        };
      }
    } catch (_) {}
  }

  // 6. File history
  let fileHistory = [];
  try {
    const histRes = await gitHistoryService.getFileHistory(repositoryId, relativePath);
    if (histRes && histRes.success && Array.isArray(histRes.history)) {
      fileHistory = histRes.history;
    }
  } catch (_) {}

  // 7. GitHub PR & Issue evidence
  let githubData = {
    pullRequests: [],
    issues: [],
    github: {
      available: false,
      reason: 'GitHub context unavailable'
    }
  };

  if (meta && meta.owner && meta.repo && commitHash) {
    try {
      const ghRes = await githubService.getCommitGitHubContext(meta.owner, meta.repo, commitHash);
      if (ghRes) {
        githubData = {
          pullRequests: ghRes.pullRequests || [],
          issues: ghRes.issues || [],
          github: {
            available: Boolean(ghRes.githubAvailable),
            reason: ghRes.warning || (ghRes.githubAvailable ? null : 'GitHub context unavailable')
          }
        };
      }
    } catch (_) {}
  }

  // 8. Assemble unified Evidence Package
  return {
    success: true,
    repository: {
      owner: meta.owner || '',
      name: meta.name || meta.repo || '',
      url: meta.url || ''
    },
    file: {
      path: relativePath,
      language: language
    },
    selection: {
      line: lineNum,
      code: selectedCode
    },
    blame: {
      commitHash: commitHash || '',
      shortHash: commitHash ? commitHash.slice(0, 7) : '',
      author: blameData.commit ? blameData.commit.author : '',
      date: blameData.commit ? blameData.commit.date : '',
      line: lineNum
    },
    commit: {
      hash: commitDetails.hash || commitHash || '',
      shortHash: commitDetails.shortHash || (commitHash ? commitHash.slice(0, 7) : ''),
      message: commitDetails.message || '',
      author: commitDetails.author || '',
      date: commitDetails.date || '',
      filesChanged: commitDetails.filesChanged || []
    },
    diff: diffObj,
    fileHistory: fileHistory,
    pullRequests: githubData.pullRequests,
    issues: githubData.issues,
    github: githubData.github
  };
}

module.exports = {
  buildEvidencePackage,
  detectLanguage
};

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
 * Build unified Evidence Package for a selected line or line range in a file
 */
async function buildEvidencePackage(repositoryId, relativePath, startLineNumber, endLineNumber) {
  const sLine = parseInt(startLineNumber, 10);
  const eLine = (endLineNumber !== undefined && endLineNumber !== null) ? parseInt(endLineNumber, 10) : sLine;

  if (isNaN(sLine) || sLine <= 0 || isNaN(eLine) || eLine <= 0) {
    throw { status: 400, message: 'Invalid line range. Must be positive integers.' };
  }

  const minLine = Math.min(sLine, eLine);
  const maxLine = Math.max(sLine, eLine);

  // 1. Get repository metadata
  const meta = await repositoryService.getRepoMetadata(repositoryId);

  // 2. Read file content to extract the code range
  let fileContentObj;
  try {
    fileContentObj = await repositoryService.getFileContent(repositoryId, relativePath);
  } catch (err) {
    throw { status: err.status || 500, message: err.message || 'Unable to read file content for evidence.' };
  }

  const contentLines = (fileContentObj.content || '').split('\n');
  if (minLine > contentLines.length) {
    throw { status: 400, message: `Line number ${minLine} exceeds total lines (${contentLines.length}) in file.` };
  }

  const clampedMaxLine = Math.min(maxLine, contentLines.length);
  const selectedLinesSlice = contentLines.slice(minLine - 1, clampedMaxLine);
  const selectedCode = selectedLinesSlice.join('\n');
  const language = detectLanguage(relativePath);

  // 3. Multi-line Git blame
  let blameData;
  try {
    blameData = await gitHistoryService.getGitBlame(repositoryId, relativePath, minLine, clampedMaxLine);
  } catch (err) {
    throw { status: err.status || 500, message: err.message || 'Git blame failed while building evidence package.' };
  }

  const primaryCommitHash = blameData.commit ? blameData.commit.hash : '';
  const uniqueCommits = blameData.uniqueCommits || [blameData.commit];
  let commitDetails = blameData.commit;

  // 4. Commit diff for primary commit
  let diffObj = { available: false, content: null };
  if (primaryCommitHash) {
    try {
      const diffRes = await gitHistoryService.getCommitDiff(repositoryId, primaryCommitHash, relativePath);
      if (diffRes && diffRes.success && diffRes.diff) {
        diffObj = { available: true, content: diffRes.diff };
      }
    } catch (_) {}
  }

  // 5. File history
  let fileHistory = [];
  try {
    const histRes = await gitHistoryService.getFileHistory(repositoryId, relativePath);
    if (histRes && histRes.success && Array.isArray(histRes.history)) {
      fileHistory = histRes.history;
    }
  } catch (_) {}

  // 6. GitHub PR & Issue evidence across unique commits in range
  let allPRs = [];
  let allIssues = [];
  let githubAvailable = true;
  let githubReason = null;

  if (meta && meta.owner && meta.repo && uniqueCommits.length > 0) {
    const prMap = new Map();
    const issueMap = new Map();

    for (const c of uniqueCommits) {
      if (!c.hash) continue;
      try {
        const ghRes = await githubService.getCommitGitHubContext(meta.owner, meta.repo, c.hash);
        if (ghRes) {
          if (ghRes.githubAvailable === false) githubAvailable = false;
          if (ghRes.warning) githubReason = ghRes.warning;
          (ghRes.pullRequests || []).forEach(pr => prMap.set(pr.number, pr));
          (ghRes.issues || []).forEach(issue => issueMap.set(issue.number, issue));
        }
      } catch (_) {}
    }
    allPRs = Array.from(prMap.values());
    allIssues = Array.from(issueMap.values());
  }

  const selectionType = (minLine === clampedMaxLine) ? 'line' : 'range';

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
      startLine: minLine,
      endLine: clampedMaxLine,
      line: minLine,
      type: selectionType,
      code: selectedCode
    },
    blame: {
      startLine: minLine,
      endLine: clampedMaxLine,
      commitHash: primaryCommitHash,
      shortHash: primaryCommitHash ? primaryCommitHash.slice(0, 7) : '',
      author: commitDetails ? commitDetails.author : '',
      date: commitDetails ? commitDetails.date : '',
      lines: (blameData.blame && blameData.blame.lines) || []
    },
    commit: {
      hash: commitDetails ? commitDetails.hash : '',
      shortHash: commitDetails ? (commitDetails.shortHash || commitDetails.hash.slice(0, 7)) : '',
      message: commitDetails ? commitDetails.message : '',
      author: commitDetails ? commitDetails.author : '',
      date: commitDetails ? commitDetails.date : '',
      filesChanged: commitDetails ? (commitDetails.filesChanged || []) : []
    },
    uniqueCommits: uniqueCommits,
    diff: diffObj,
    fileHistory: fileHistory,
    pullRequests: allPRs,
    issues: allIssues,
    github: {
      available: githubAvailable,
      reason: githubReason
    }
  };
}

module.exports = {
  buildEvidencePackage,
  detectLanguage
};

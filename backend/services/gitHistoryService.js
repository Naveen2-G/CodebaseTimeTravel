const path = require('path');
const { getRepoDirectory, runGitCommand } = require('./repositoryService');
const fs = require('fs').promises;

/**
 * Get array of files changed in a specific commit
 */
async function getChangedFilesForCommit(repoDir, commitHash) {
  try {
    const stdout = await runGitCommand(['diff-tree', '--no-commit-id', '--name-only', '-r', '--root', commitHash], repoDir);
    if (!stdout) return [];
    return stdout.split('\n').map(line => line.trim()).filter(Boolean);
  } catch (err) {
    console.error('Error fetching changed files for commit:', err);
    return [];
  }
}

/**
 * Perform Git blame on a specific line or line range of a file
 */
async function getGitBlame(repositoryId, relativePath, startLineNumber, endLineNumber) {
  if (!relativePath || typeof relativePath !== 'string' || !relativePath.trim()) {
    throw { status: 400, message: 'Invalid file path' };
  }

  const sLine = parseInt(startLineNumber, 10);
  const eLine = endLineNumber !== undefined && endLineNumber !== null ? parseInt(endLineNumber, 10) : sLine;

  if (isNaN(sLine) || sLine < 1 || isNaN(eLine) || eLine < 1) {
    throw { status: 400, message: 'Invalid line range' };
  }

  const minLine = Math.min(sLine, eLine);
  const maxLine = Math.max(sLine, eLine);

  const repoDir = getRepoDirectory(repositoryId);
  const normalizedRelative = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
  const targetPath = path.resolve(repoDir, normalizedRelative);

  if (!targetPath.startsWith(repoDir + path.sep) && targetPath !== repoDir) {
    throw { status: 400, message: 'Invalid file path' };
  }

  try {
    await fs.access(repoDir);
  } catch {
    throw { status: 404, message: 'Repository does not exist.' };
  }

  try {
    await fs.access(targetPath);
  } catch {
    throw { status: 404, message: 'File does not exist.' };
  }

  try {
    const gitArgs = ['blame', '-L', `${minLine},${maxLine}`, '--porcelain', '--', normalizedRelative];
    const stdout = await runGitCommand(gitArgs, repoDir);

    const lines = stdout.split('\n');
    if (!lines || lines.length === 0 || !lines[0].trim()) {
      throw { status: 500, message: 'Unable to determine history for this line range.' };
    }

    const blameMap = new Map();
    const lineBlameList = [];

    let currentHash = '';
    let currentAuthor = 'Unknown';
    let currentEmail = '';
    let currentTime = 0;
    let currentSummary = '';
    let currentFinalLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l) continue;

      if (/^[a-f0-9]{40}\s+\d+\s+\d+/.test(l)) {
        const parts = l.trim().split(/\s+/);
        currentHash = parts[0];
        currentFinalLine = parseInt(parts[2], 10);
      } else if (l.startsWith('author ')) {
        currentAuthor = l.substring(7).trim();
      } else if (l.startsWith('author-mail ')) {
        currentEmail = l.substring(12).trim().replace(/^<|>$/g, '');
      } else if (l.startsWith('author-time ')) {
        currentTime = parseInt(l.substring(12).trim(), 10);
      } else if (l.startsWith('summary ')) {
        currentSummary = l.substring(8).trim();
      } else if (l.startsWith('\t')) {
        const lineText = l.substring(1);
        const dateISO = currentTime ? new Date(currentTime * 1000).toISOString() : new Date().toISOString();

        const entry = {
          line: currentFinalLine,
          commitHash: currentHash,
          shortHash: currentHash.slice(0, 7),
          author: currentAuthor,
          date: dateISO,
          message: currentSummary,
          code: lineText
        };
        lineBlameList.push(entry);

        if (!blameMap.has(currentHash)) {
          blameMap.set(currentHash, {
            hash: currentHash,
            shortHash: currentHash.slice(0, 7),
            author: currentAuthor,
            email: currentEmail,
            date: dateISO,
            message: currentSummary
          });
        }
      }
    }

    const uniqueCommits = Array.from(blameMap.values());
    const primaryCommitObj = uniqueCommits[0] || {
      hash: currentHash,
      shortHash: currentHash.slice(0, 7),
      author: currentAuthor,
      date: currentTime ? new Date(currentTime * 1000).toISOString() : new Date().toISOString(),
      message: currentSummary
    };

    const filesChanged = await getChangedFilesForCommit(repoDir, primaryCommitObj.hash);
    primaryCommitObj.filesChanged = filesChanged;

    return {
      success: true,
      file: relativePath,
      startLine: minLine,
      endLine: maxLine,
      line: minLine,
      type: minLine === maxLine ? 'line' : 'range',
      blame: {
        commit: primaryCommitObj.hash,
        author: primaryCommitObj.author,
        date: primaryCommitObj.date,
        message: primaryCommitObj.message,
        lines: lineBlameList
      },
      commit: primaryCommitObj,
      uniqueCommits: uniqueCommits
    };
  } catch (err) {
    if (err.status) throw err;
    console.error('Git blame error:', err);
    throw { status: 500, message: 'Unable to determine history for this line range.' };
  }
}

/**
 * Retrieve commit details by commit hash
 */
async function getCommitDetails(repositoryId, commitHash) {
  if (!commitHash || typeof commitHash !== 'string' || !/^[a-f0-9]{4,40}$/i.test(commitHash.trim())) {
    throw { status: 400, message: 'Invalid commit hash' };
  }

  const cleanHash = commitHash.trim();
  const repoDir = getRepoDirectory(repositoryId);

  try {
    await fs.access(repoDir);
  } catch {
    throw { status: 404, message: 'Repository does not exist.' };
  }

  try {
    const stdout = await runGitCommand(['show', '--no-patch', '--format=%H%n%h%n%an%n%ae%n%cI%n%B', cleanHash], repoDir);
    const lines = stdout.split('\n');

    const hash = lines[0] ? lines[0].trim() : cleanHash;
    const shortHash = lines[1] ? lines[1].trim() : cleanHash.slice(0, 7);
    const author = lines[2] ? lines[2].trim() : '';
    const authorEmail = lines[3] ? lines[3].trim() : '';
    const date = lines[4] ? lines[4].trim() : '';
    const message = lines.slice(5).join('\n').trim();

    const filesChanged = await getChangedFilesForCommit(repoDir, hash);

    return {
      success: true,
      commit: {
        hash,
        shortHash,
        author,
        email: authorEmail,
        authorEmail: authorEmail,
        date,
        message,
        filesChanged
      }
    };
  } catch (err) {
    if (err.status) throw err;
    console.error('Get commit error:', err);
    throw { status: 404, message: 'Commit does not exist.' };
  }
}

/**
 * Retrieve raw commit diff
 */
async function getCommitDiff(repositoryId, commitHash, relativePath) {
  if (!commitHash || typeof commitHash !== 'string' || !/^[a-f0-9]{4,40}$/i.test(commitHash.trim())) {
    throw { status: 400, message: 'Invalid commit hash' };
  }

  const cleanHash = commitHash.trim();
  const repoDir = getRepoDirectory(repositoryId);

  try {
    await fs.access(repoDir);
  } catch {
    throw { status: 404, message: 'Repository does not exist.' };
  }

  const gitArgs = ['show', cleanHash];
  if (relativePath && typeof relativePath === 'string' && relativePath.trim()) {
    const normalizedRelative = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
    const targetPath = path.resolve(repoDir, normalizedRelative);
    if (targetPath.startsWith(repoDir + path.sep)) {
      gitArgs.push('--', normalizedRelative);
    }
  }

  try {
    const stdout = await runGitCommand(gitArgs, repoDir);
    return {
      success: true,
      commit: cleanHash,
      commitHash: cleanHash,
      file: relativePath || 'all',
      diff: stdout
    };
  } catch (err) {
    if (err.status) throw err;
    console.error('Get commit diff error:', err);
    throw { status: 500, message: 'Diff cannot be generated.' };
  }
}

/**
 * Retrieve commit history affecting a specific file
 */
async function getFileHistory(repositoryId, relativePath) {
  if (!relativePath || typeof relativePath !== 'string' || !relativePath.trim()) {
    throw { status: 400, message: 'Invalid file path' };
  }

  const repoDir = getRepoDirectory(repositoryId);
  const normalizedRelative = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
  const targetPath = path.resolve(repoDir, normalizedRelative);

  if (!targetPath.startsWith(repoDir + path.sep) && targetPath !== repoDir) {
    throw { status: 400, message: 'Invalid file path' };
  }

  try {
    await fs.access(repoDir);
  } catch {
    throw { status: 404, message: 'Repository does not exist.' };
  }

  try {
    await fs.access(targetPath);
  } catch {
    throw { status: 404, message: 'File does not exist.' };
  }

  try {
    const gitArgs = ['log', '--follow', '--format=%H%n%h%n%an%n%ae%n%cI%n%s%n---END-LOG-ITEM---', '--', normalizedRelative];
    const stdout = await runGitCommand(gitArgs, repoDir);

    if (!stdout || !stdout.trim()) {
      return {
        success: true,
        file: relativePath,
        history: []
      };
    }

    const items = stdout.split('---END-LOG-ITEM---').map(item => item.trim()).filter(Boolean);
    const history = items.map(item => {
      const lines = item.split('\n').map(l => l.trim());
      const hash = lines[0] || '';
      const shortHash = lines[1] || (hash ? hash.slice(0, 7) : '');
      const author = lines[2] || 'Unknown';
      const email = lines[3] || '';
      const date = lines[4] || '';
      const message = lines[5] || '';

      return {
        hash,
        shortHash,
        author,
        email,
        date,
        message
      };
    });

    return {
      success: true,
      file: relativePath,
      history
    };
  } catch (err) {
    if (err.status) throw err;
    console.error('File history error:', err);
    throw { status: 500, message: 'File history unavailable.' };
  }
}

module.exports = {
  getGitBlame,
  getCommitDetails,
  getCommitDiff,
  getFileHistory
};

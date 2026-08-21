const path = require('path');
const { getRepoDirectory, runGitCommand } = require('./repositoryService');
const fs = require('fs').promises;

/**
 * Perform Git blame on a specific line of a file
 */
async function getGitBlame(repositoryId, relativePath, lineNumber) {
  if (!relativePath || typeof relativePath !== 'string' || !relativePath.trim()) {
    throw { status: 400, message: 'Invalid file path' };
  }

  const line = parseInt(lineNumber, 10);
  if (isNaN(line) || line < 1) {
    throw { status: 400, message: 'Invalid line number' };
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
    const gitArgs = ['blame', '-L', `${line},${line}`, '--porcelain', '--', normalizedRelative];
    const stdout = await runGitCommand(gitArgs, repoDir);

    const lines = stdout.split('\n');
    if (!lines || lines.length === 0 || !lines[0].trim()) {
      throw { status: 500, message: 'Git blame returned empty output.' };
    }

    const firstLine = lines[0].trim();
    const hash = firstLine.split(' ')[0];

    let author = 'Unknown';
    let authorEmail = '';
    let authorTime = 0;
    let summary = 'No message';

    for (let i = 1; i < lines.length; i++) {
      const l = lines[i];
      if (l.startsWith('author ')) {
        author = l.substring(7).trim();
      } else if (l.startsWith('author-mail ')) {
        authorEmail = l.substring(12).trim().replace(/^<|>$/g, '');
      } else if (l.startsWith('author-time ')) {
        authorTime = parseInt(l.substring(12).trim(), 10);
      } else if (l.startsWith('summary ')) {
        summary = l.substring(8).trim();
      }
    }

    const dateISO = authorTime ? new Date(authorTime * 1000).toISOString() : new Date().toISOString();

    return {
      success: true,
      file: relativePath,
      line: line,
      commit: {
        hash: hash,
        shortHash: hash.slice(0, 7),
        author: author,
        authorEmail: authorEmail,
        date: dateISO,
        message: summary
      }
    };
  } catch (err) {
    if (err.status) throw err;
    console.error('Git blame error:', err);
    throw { status: 500, message: 'Git blame failed for the specified line.' };
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
    // Get commit details and changed files list
    const stdout = await runGitCommand(['show', '--stat', '--name-only', '--format=%H%n%h%n%an%n%ae%n%cI%n%B---END-COMMIT-MSG---', cleanHash], repoDir);
    
    const parts = stdout.split('---END-COMMIT-MSG---');
    const headerLines = parts[0].split('\n');

    const hash = headerLines[0] ? headerLines[0].trim() : cleanHash;
    const shortHash = headerLines[1] ? headerLines[1].trim() : cleanHash.slice(0, 7);
    const author = headerLines[2] ? headerLines[2].trim() : '';
    const authorEmail = headerLines[3] ? headerLines[3].trim() : '';
    const date = headerLines[4] ? headerLines[4].trim() : '';
    const message = headerLines.slice(5).join('\n').trim();

    const remainder = parts[1] || '';
    const filesChanged = remainder.split('\n').map(f => f.trim()).filter(f => f.length > 0 && !f.includes('files changed') && !f.includes('insertions') && !f.includes('deletions'));

    return {
      success: true,
      commit: {
        hash,
        shortHash,
        author,
        authorEmail,
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

module.exports = {
  getGitBlame,
  getCommitDetails,
  getCommitDiff
};

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
      throw { status: 500, message: 'Unable to determine the history of this line.' };
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
    const filesChanged = await getChangedFilesForCommit(repoDir, hash);

    return {
      success: true,
      file: relativePath,
      line: line,
      blame: {
        commit: hash,
        author: author,
        date: dateISO,
        message: summary
      },
      commit: {
        hash: hash,
        shortHash: hash.slice(0, 7),
        author: author,
        email: authorEmail,
        authorEmail: authorEmail,
        date: dateISO,
        message: summary,
        filesChanged: filesChanged
      }
    };
  } catch (err) {
    if (err.status) throw err;
    console.error('Git blame error:', err);
    throw { status: 500, message: 'Unable to determine the history of this line.' };
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

module.exports = {
  getGitBlame,
  getCommitDetails,
  getCommitDiff
};

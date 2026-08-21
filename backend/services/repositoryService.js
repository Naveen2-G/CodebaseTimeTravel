const { execFile } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Helper to run git commands safely without shell injection risks
function runGitCommand(args, cwd, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stdout, stderr });
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

// Validate GitHub URL and extract owner & repo name
function parseGitHubUrl(url) {
  if (!url || typeof url !== 'string' || !url.trim()) {
    throw { status: 400, message: 'Please enter a GitHub repository URL.' };
  }

  const cleanUrl = url.trim();
  const githubRegex = /^https:\/\/(www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(\.git)?\/?$/;
  const match = cleanUrl.match(githubRegex);

  if (!match) {
    throw { status: 400, message: 'Please enter a valid GitHub repository URL.' };
  }

  const owner = match[2];
  let repo = match[3];
  if (repo.endsWith('.git')) {
    repo = repo.slice(0, -4);
  }

  const canonicalUrl = `https://github.com/${owner}/${repo}`;

  return { owner, repo, canonicalUrl };
}

// Count files recursively excluding ignored directories
async function countFilesRecursively(dirPath) {
  const ignoredDirs = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);
  let count = 0;

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!ignoredDirs.has(entry.name)) {
          await walk(path.join(currentDir, entry.name));
        }
      } else if (entry.isFile()) {
        count++;
      }
    }
  }

  await walk(dirPath);
  return count;
}

/**
 * Import and process repository metadata
 */
async function importRepository(url) {
  // 1. Validate URL
  const { owner, repo, canonicalUrl } = parseGitHubUrl(url);

  // 2. Check if Git is available
  try {
    await runGitCommand(['--version'], process.cwd(), 5000);
  } catch (err) {
    console.error('Git check error:', err);
    throw { status: 500, message: 'Git is not installed or unavailable on the server.' };
  }

  // 3. Prepare target destination directory
  const repositoriesBaseDir = path.join(__dirname, '..', 'repositories');
  await fs.mkdir(repositoriesBaseDir, { recursive: true });

  const uniqueId = crypto.randomUUID();
  const targetDir = path.join(repositoriesBaseDir, uniqueId);

  // 4. Clone repository safely
  try {
    await runGitCommand(['clone', canonicalUrl, targetDir], process.cwd(), 60000);
  } catch (err) {
    console.error('Git clone error:', err);
    
    // Clean up partial dir if created
    try {
      await fs.rm(targetDir, { recursive: true, force: true });
    } catch (_) {}

    const stderrStr = (err.stderr || '').toString();
    const errorStr = (err.error ? err.error.toString() : '');

    if (err.error && err.error.killed) {
      throw { status: 408, message: 'Repository is too large or took too long to import.' };
    }
    if (stderrStr.includes('Could not resolve host') || stderrStr.includes('not found') || stderrStr.includes('Authentication failed')) {
      throw { status: 404, message: 'Repository could not be found.' };
    }

    throw { status: 500, message: 'Unable to import repository.' };
  }

  // 5. Extract metadata (File count, Commit count, Latest commit)
  try {
    const fileCount = await countFilesRecursively(targetDir);

    // Commit count
    const commitCountStr = await runGitCommand(['rev-list', '--count', 'HEAD'], targetDir);
    const commitCount = parseInt(commitCountStr, 10) || 0;

    // Latest commit details
    const gitLogStr = await runGitCommand(['log', '-1', '--format=%H%n%s%n%cI'], targetDir);
    const [hash, message, date] = gitLogStr.split('\n');

    return {
      success: true,
      repository: {
        id: uniqueId,
        name: repo,
        owner: owner,
        url: canonicalUrl,
        files: fileCount,
        commits: commitCount,
        latestCommit: {
          hash: hash || '',
          message: message || '',
          date: date || new Date().toISOString()
        }
      }
    };
  } catch (err) {
    console.error('Metadata extraction error:', err);
    throw { status: 500, message: 'Failed to extract repository metadata after cloning.' };
  }
}

module.exports = {
  importRepository,
  parseGitHubUrl,
  countFilesRecursively
};

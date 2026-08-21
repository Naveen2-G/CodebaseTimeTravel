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

// Parse owner and repo from Git remote URL
function parseOwnerAndRepoFromRemote(remoteUrl) {
  if (!remoteUrl) return null;
  const match = remoteUrl.match(/github\.com[:/]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(\.git)?$/);
  if (match) {
    return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
  }
  return null;
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

// Security helper: resolve repo directory and prevent path traversal
function getRepoDirectory(repositoryId) {
  if (!repositoryId || typeof repositoryId !== 'string' || repositoryId.includes('..') || repositoryId.includes('/') || repositoryId.includes('\\')) {
    throw { status: 400, message: 'Invalid repository ID' };
  }
  const repoDir = path.resolve(__dirname, '..', 'repositories', repositoryId);
  return repoDir;
}

/**
 * Retrieve metadata (owner, repo, url) for a stored repository
 */
async function getRepoMetadata(repositoryId) {
  const repoDir = getRepoDirectory(repositoryId);
  const metaFile = path.join(repoDir, '_metadata.json');

  try {
    const raw = await fs.readFile(metaFile, 'utf8');
    return JSON.parse(raw);
  } catch (_) {}

  try {
    const remoteUrl = await runGitCommand(['remote', 'get-url', 'origin'], repoDir);
    const parsed = parseOwnerAndRepoFromRemote(remoteUrl);
    if (parsed) {
      return {
        id: repositoryId,
        owner: parsed.owner,
        repo: parsed.repo,
        url: `https://github.com/${parsed.owner}/${parsed.repo}`
      };
    }
  } catch (_) {}

  return { id: repositoryId, owner: '', repo: '', url: '' };
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
    
    try {
      await fs.rm(targetDir, { recursive: true, force: true });
    } catch (_) {}

    const stderrStr = (err.stderr || '').toString();

    if (err.error && err.error.killed) {
      throw { status: 408, message: 'Repository is too large or took too long to import.' };
    }
    if (stderrStr.includes('Could not resolve host') || stderrStr.includes('not found') || stderrStr.includes('Authentication failed')) {
      throw { status: 404, message: 'Repository could not be found.' };
    }

    throw { status: 500, message: 'Unable to import repository.' };
  }

  // 5. Extract metadata & save _metadata.json
  try {
    const fileCount = await countFilesRecursively(targetDir);

    const commitCountStr = await runGitCommand(['rev-list', '--count', 'HEAD'], targetDir);
    const commitCount = parseInt(commitCountStr, 10) || 0;

    const gitLogStr = await runGitCommand(['log', '-1', '--format=%H%n%s%n%cI'], targetDir);
    const [hash, message, date] = gitLogStr.split('\n');

    const metaObj = {
      id: uniqueId,
      name: repo,
      owner: owner,
      repo: repo,
      url: canonicalUrl,
      files: fileCount,
      commits: commitCount
    };

    await fs.writeFile(path.join(targetDir, '_metadata.json'), JSON.stringify(metaObj, null, 2));

    return {
      success: true,
      repository: {
        ...metaObj,
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

/**
 * Get nested file tree for a repository
 */
async function getFileTree(repositoryId) {
  const repoDir = getRepoDirectory(repositoryId);

  try {
    await fs.access(repoDir);
  } catch {
    throw { status: 404, message: 'Repository does not exist.' };
  }

  const ignoredDirs = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);

  async function buildTree(currentDir, relativePath = '') {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    const nodes = [];

    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
      if (entry.name === '_metadata.json') continue; // Hide metadata file from tree

      if (entry.isDirectory()) {
        if (!ignoredDirs.has(entry.name)) {
          const itemRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
          const children = await buildTree(path.join(currentDir, entry.name), itemRelativePath);
          nodes.push({
            name: entry.name,
            path: itemRelativePath,
            type: 'folder',
            children
          });
        }
      } else if (entry.isFile()) {
        const itemRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
        nodes.push({
          name: entry.name,
          path: itemRelativePath,
          type: 'file'
        });
      }
    }
    return nodes;
  }

  const tree = await buildTree(repoDir);
  return { success: true, tree };
}

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico',
  '.mp4', '.mp3', '.zip', '.pdf', '.exe', '.bin', '.tar',
  '.gz', '.woff', '.woff2', '.ttf', '.eot', '.jar', '.class', '.pyc'
]);

/**
 * Read source file content safely
 */
async function getFileContent(repositoryId, relativePath) {
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

  const ext = path.extname(targetPath).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) {
    throw { status: 400, message: 'This file is a binary file and cannot be displayed.' };
  }

  const stat = await fs.stat(targetPath);
  if (stat.size > 1024 * 1024) {
    throw { status: 400, message: 'This file is too large to display.' };
  }

  const content = await fs.readFile(targetPath, 'utf8');
  const lines = content.split('\n').length;

  return {
    success: true,
    path: relativePath,
    content,
    lines
  };
}

module.exports = {
  importRepository,
  parseGitHubUrl,
  countFilesRecursively,
  getRepoDirectory,
  getRepoMetadata,
  getFileTree,
  getFileContent,
  runGitCommand
};

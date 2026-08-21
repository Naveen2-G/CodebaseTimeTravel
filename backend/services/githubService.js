const contextCache = new Map();
let hasLoggedTokenWarning = false;

/**
 * Get headers for GitHub API requests
 */
function getGitHubHeaders() {
  const token = process.env.GITHUB_TOKEN;
  const headers = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'CodebaseTimeTraveler-App'
  };

  if (token && token.trim()) {
    headers['Authorization'] = `Bearer ${token.trim()}`;
  } else if (!hasLoggedTokenWarning) {
    console.warn('[GitHubService] Warning: GITHUB_TOKEN environment variable is not set. Requests will be unauthenticated (subject to GitHub rate limits).');
    hasLoggedTokenWarning = true;
  }

  return headers;
}

/**
 * Extract issue numbers referenced in text (e.g. "Fixes #37", "Closes #12")
 */
function extractLinkedIssueNumbers(text) {
  if (!text || typeof text !== 'string') return [];
  const regex = /(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\s+#(\d+)/gi;
  const numbers = new Set();
  let match;
  while ((match = regex.exec(text)) !== null) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num)) {
      numbers.add(num);
    }
  }
  return Array.from(numbers);
}

/**
 * Retrieve GitHub PR and Issue context for a specific commit SHA
 */
async function getCommitGitHubContext(owner, repo, commitHash) {
  if (!owner || !repo || !commitHash) {
    return {
      pullRequests: [],
      issues: [],
      githubAvailable: false
    };
  }

  const cacheKey = `${owner}/${repo}/${commitHash}`.toLowerCase();
  if (contextCache.has(cacheKey)) {
    return contextCache.get(cacheKey);
  }

  const headers = getGitHubHeaders();

  try {
    // 1. List pull requests associated with commit
    const prsUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(commitHash)}/pulls`;
    const prsRes = await fetch(prsUrl, { headers });

    if (prsRes.status === 403 || prsRes.status === 429) {
      console.warn(`[GitHubService] GitHub API rate limit hit when querying commit ${commitHash}`);
      return {
        pullRequests: [],
        issues: [],
        githubAvailable: false,
        warning: 'Git history available. GitHub PR/Issue context temporarily unavailable due to rate limits.'
      };
    }

    if (!prsRes.ok) {
      // 404 or other non-200
      const result = {
        pullRequests: [],
        issues: [],
        githubAvailable: true
      };
      contextCache.set(cacheKey, result);
      return result;
    }

    const prsData = await prsRes.json();
    if (!Array.isArray(prsData) || prsData.length === 0) {
      const result = {
        pullRequests: [],
        issues: [],
        githubAvailable: true
      };
      contextCache.set(cacheKey, result);
      return result;
    }

    const pullRequests = prsData.map(pr => ({
      number: pr.number,
      title: pr.title || 'Untitled PR',
      state: pr.state || 'unknown',
      merged: Boolean(pr.merged_at),
      author: pr.user ? pr.user.login : 'unknown',
      url: pr.html_url || '',
      body: pr.body || ''
    }));

    // 2. Find linked issues from PR bodies
    const issueNumbersToFetch = new Set();
    for (const pr of pullRequests) {
      const nums = extractLinkedIssueNumbers(pr.body);
      nums.forEach(n => issueNumbersToFetch.add(n));
    }

    const issues = [];
    for (const issueNum of issueNumbersToFetch) {
      try {
        const issueUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNum}`;
        const issueRes = await fetch(issueUrl, { headers });
        if (issueRes.ok) {
          const issueData = await issueRes.json();
          // Filter out pull requests if GitHub returned a PR under issues endpoint
          if (!issueData.pull_request) {
            issues.push({
              number: issueData.number,
              title: issueData.title || 'Untitled Issue',
              state: issueData.state || 'unknown',
              url: issueData.html_url || '',
              body: issueData.body || ''
            });
          }
        }
      } catch (issueErr) {
        console.error(`[GitHubService] Failed to fetch issue #${issueNum}:`, issueErr);
      }
    }

    const result = {
      pullRequests,
      issues,
      githubAvailable: true
    };

    contextCache.set(cacheKey, result);
    return result;

  } catch (err) {
    console.error('[GitHubService] Error fetching GitHub context:', err);
    return {
      pullRequests: [],
      issues: [],
      githubAvailable: false,
      warning: 'Git history available. GitHub PR/Issue context temporarily unavailable.'
    };
  }
}

module.exports = {
  getCommitGitHubContext,
  extractLinkedIssueNumbers
};

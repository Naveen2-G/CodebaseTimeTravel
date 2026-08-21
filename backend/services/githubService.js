const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const contextCache = new Map();

/**
 * Get headers for GitHub API requests
 */
function getGitHubHeaders() {
  const token = process.env.GITHUB_TOKEN;
  const headers = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'CodebaseTimeTraveler-App'
  };

  if (token && token.trim()) {
    headers['Authorization'] = `Bearer ${token.trim()}`;
  }

  return headers;
}

/**
 * Diagnostic status check for GitHub API integration
 */
async function checkGitHubStatus() {
  const isConfigured = Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim());
  const headers = getGitHubHeaders();

  try {
    const res = await fetch('https://api.github.com/rate_limit', { headers });
    if (res.ok) {
      const data = await res.json();
      return {
        configured: isConfigured,
        authenticated: isConfigured && res.status === 200,
        rateLimit: data.rate ? data.rate.limit : 0,
        remaining: data.rate ? data.rate.remaining : 0
      };
    } else {
      const errBody = await res.json().catch(() => ({}));
      console.warn(`[GitHubService] Diagnostic rate_limit check returned ${res.status}: ${errBody.message || ''}`);
      return {
        configured: isConfigured,
        authenticated: false,
        status: res.status,
        error: errBody.message || 'GitHub API error'
      };
    }
  } catch (err) {
    console.error('[GitHubService] Diagnostic check error:', err.message);
    return {
      configured: isConfigured,
      authenticated: false,
      error: 'Network connection failure'
    };
  }
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
  const endpointPath = `/repos/${owner}/${repo}/commits/${commitHash}/pulls`;
  const prsUrl = `https://api.github.com${endpointPath}`;

  try {
    const prsRes = await fetch(prsUrl, { headers });

    // Handle 401 Unauthorized (Invalid token)
    if (prsRes.status === 401) {
      const errBody = await prsRes.json().catch(() => ({}));
      console.warn(`[GitHubService] API 401 error on ${endpointPath}: ${errBody.message || 'Unauthorized'}`);
      return {
        pullRequests: [],
        issues: [],
        githubAvailable: false,
        warning: 'Git history available. GitHub PR/Issue context temporarily unavailable (Bad credentials).'
      };
    }

    // Handle 403 Forbidden / Rate Limit
    if (prsRes.status === 403 || prsRes.status === 429) {
      const errBody = await prsRes.json().catch(() => ({}));
      console.warn(`[GitHubService] API ${prsRes.status} error on ${endpointPath}: ${errBody.message || 'Forbidden/Rate limit'}`);
      return {
        pullRequests: [],
        issues: [],
        githubAvailable: false,
        warning: 'Git history available. GitHub PR/Issue context temporarily unavailable due to rate limits or permissions.'
      };
    }

    if (!prsRes.ok) {
      // 404 or other non-200 status (No PR or repo not found)
      console.log(`[GitHubService] Info: GET ${endpointPath} returned ${prsRes.status}`);
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

    // Find linked issues from PR bodies
    const issueNumbersToFetch = new Set();
    for (const pr of pullRequests) {
      const nums = extractLinkedIssueNumbers(pr.body);
      nums.forEach(n => issueNumbersToFetch.add(n));
    }

    const issues = [];
    for (const issueNum of issueNumbersToFetch) {
      try {
        const issueEndpoint = `/repos/${owner}/${repo}/issues/${issueNum}`;
        const issueUrl = `https://api.github.com${issueEndpoint}`;
        const issueRes = await fetch(issueUrl, { headers });
        if (issueRes.ok) {
          const issueData = await issueRes.json();
          if (!issueData.pull_request) {
            issues.push({
              number: issueData.number,
              title: issueData.title || 'Untitled Issue',
              state: issueData.state || 'unknown',
              url: issueData.html_url || '',
              body: issueData.body || ''
            });
          }
        } else {
          const errBody = await issueRes.json().catch(() => ({}));
          console.warn(`[GitHubService] API ${issueRes.status} on ${issueEndpoint}: ${errBody.message || ''}`);
        }
      } catch (issueErr) {
        console.error(`[GitHubService] Failed to fetch issue #${issueNum}:`, issueErr.message);
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
    console.error('[GitHubService] Error fetching GitHub context:', err.message);
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
  extractLinkedIssueNumbers,
  checkGitHubStatus
};

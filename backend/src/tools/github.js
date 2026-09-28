'use strict';

const axios = require('axios');
const config = require('../config/env');
const logger = require('../utils/logger');

const GH_API = 'https://api.github.com';

const tool = {
  name: 'github',
  description: 'Interact with GitHub — list repos, create repos, read/create/update files in repos, manage branches, create issues.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['listRepos', 'inspectRepo', 'readFile', 'createRepo', 'createFile', 'updateFile', 'createBranch', 'createIssue', 'listIssues'],
        description: 'GitHub action to perform',
      },
      repo: { type: 'string', description: 'Repository name (without owner prefix)' },
      owner: { type: 'string', description: 'Repository owner (defaults to configured GitHub username)' },
      name: { type: 'string', description: 'New repo name (for createRepo)' },
      description: { type: 'string', description: 'Repo or issue description' },
      private: { type: 'boolean', description: 'Make repo private (for createRepo)' },
      filePath: { type: 'string', description: 'File path within repo' },
      content: { type: 'string', description: 'File content (UTF-8 text)' },
      message: { type: 'string', description: 'Commit message' },
      branch: { type: 'string', description: 'Branch name (default: main)' },
      sourceBranch: { type: 'string', description: 'Source branch for new branch (for createBranch)' },
      title: { type: 'string', description: 'Issue title (for createIssue)' },
      body: { type: 'string', description: 'Issue body (for createIssue)' },
    },
    required: ['action'],
  },
  requiredCredentials: ['GITHUB_TOKEN'],
  permissionLevel: 'MIXED',

  async execute(args) {
    if (!config.githubToken) {
      return {
        success: false,
        error: 'GitHub is not configured. Add GITHUB_TOKEN and GITHUB_USERNAME to your .env file.',
        retryable: false,
      };
    }

    const { action } = args;
    logger.tool('github', action, args.repo || args.name || '');

    try {
      switch (action) {
        case 'listRepos': return await listRepos(args);
        case 'inspectRepo': return await inspectRepo(args);
        case 'readFile': return await readFile(args);
        case 'createRepo': return await createRepo(args);
        case 'createFile': return await createFile(args);
        case 'updateFile': return await updateFile(args);
        case 'createBranch': return await createBranch(args);
        case 'createIssue': return await createIssue(args);
        case 'listIssues': return await listIssues(args);
        default:
          return { success: false, error: `Unknown github action: ${action}`, retryable: false };
      }
    } catch (err) {
      logger.error('[GITHUB] Error:', err.message);
      const status = err.response?.status;
      const ghMessage = err.response?.data?.message || err.message;
      return {
        success: false,
        error: `GitHub API error (${status || 'network'}): ${ghMessage}`,
        retryable: status >= 500,
      };
    }
  },
};

function ghHeaders() {
  return {
    Authorization: `Bearer ${config.githubToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function resolveOwner(owner) {
  return owner || config.githubUsername;
}

async function listRepos({ owner }) {
  const res = await axios.get(`${GH_API}/user/repos`, {
    headers: ghHeaders(),
    params: { per_page: 30, sort: 'updated', type: 'all' },
  });
  const repos = res.data.map((r) => ({
    name: r.name,
    fullName: r.full_name,
    private: r.private,
    description: r.description,
    url: r.html_url,
    updatedAt: r.updated_at,
    language: r.language,
  }));
  return { success: true, data: { repos } };
}

async function inspectRepo({ repo, owner }) {
  if (!repo) return { success: false, error: 'repo name is required', retryable: false };
  const o = resolveOwner(owner);
  const res = await axios.get(`${GH_API}/repos/${o}/${repo}`, { headers: ghHeaders() });
  const r = res.data;
  return {
    success: true,
    data: {
      name: r.name,
      fullName: r.full_name,
      description: r.description,
      private: r.private,
      defaultBranch: r.default_branch,
      url: r.html_url,
      cloneUrl: r.clone_url,
      stars: r.stargazers_count,
      language: r.language,
      topics: r.topics,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    },
  };
}

async function readFile({ repo, owner, filePath, branch = 'main' }) {
  if (!repo || !filePath) return { success: false, error: 'repo and filePath are required', retryable: false };
  const o = resolveOwner(owner);
  const res = await axios.get(`${GH_API}/repos/${o}/${repo}/contents/${filePath}`, {
    headers: ghHeaders(),
    params: { ref: branch },
  });
  const content = Buffer.from(res.data.content, 'base64').toString('utf-8');
  return {
    success: true,
    data: { repo, filePath, branch, content, sha: res.data.sha, size: res.data.size },
  };
}

async function createRepo({ name, description = '', private: isPrivate = false }) {
  if (!name) return { success: false, error: 'Repository name is required', retryable: false };
  const res = await axios.post(
    `${GH_API}/user/repos`,
    { name, description, private: isPrivate, auto_init: true },
    { headers: ghHeaders() }
  );
  logger.tool('github', 'createRepo', `Created: ${res.data.full_name}`);
  return {
    success: true,
    data: { name: res.data.name, fullName: res.data.full_name, url: res.data.html_url, cloneUrl: res.data.clone_url },
  };
}

async function createFile({ repo, owner, filePath, content, message = 'Add file via SERA', branch = 'main' }) {
  if (!repo || !filePath || content === undefined) {
    return { success: false, error: 'repo, filePath, and content are required', retryable: false };
  }
  const o = resolveOwner(owner);
  const encodedContent = Buffer.from(content).toString('base64');
  const res = await axios.put(
    `${GH_API}/repos/${o}/${repo}/contents/${filePath}`,
    { message, content: encodedContent, branch },
    { headers: ghHeaders() }
  );
  logger.tool('github', 'createFile', `${o}/${repo}/${filePath}`);
  return {
    success: true,
    data: { repo, filePath, sha: res.data.content.sha, commitSha: res.data.commit.sha, url: res.data.content.html_url },
  };
}

async function updateFile({ repo, owner, filePath, content, message = 'Update file via SERA', branch = 'main' }) {
  if (!repo || !filePath || content === undefined) {
    return { success: false, error: 'repo, filePath, and content are required', retryable: false };
  }
  const o = resolveOwner(owner);
  // Get current SHA (required for updates)
  const existing = await axios.get(`${GH_API}/repos/${o}/${repo}/contents/${filePath}`, {
    headers: ghHeaders(),
    params: { ref: branch },
  });
  const sha = existing.data.sha;
  const encodedContent = Buffer.from(content).toString('base64');
  const res = await axios.put(
    `${GH_API}/repos/${o}/${repo}/contents/${filePath}`,
    { message, content: encodedContent, sha, branch },
    { headers: ghHeaders() }
  );
  return {
    success: true,
    data: { repo, filePath, sha: res.data.content.sha, commitSha: res.data.commit.sha },
  };
}

async function createBranch({ repo, owner, branch, sourceBranch = 'main' }) {
  if (!repo || !branch) return { success: false, error: 'repo and branch are required', retryable: false };
  const o = resolveOwner(owner);
  // Get source branch SHA
  const refRes = await axios.get(`${GH_API}/repos/${o}/${repo}/git/ref/heads/${sourceBranch}`, { headers: ghHeaders() });
  const sha = refRes.data.object.sha;
  await axios.post(`${GH_API}/repos/${o}/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha }, { headers: ghHeaders() });
  return { success: true, data: { repo, branch, createdFrom: sourceBranch } };
}

async function createIssue({ repo, owner, title, body = '' }) {
  if (!repo || !title) return { success: false, error: 'repo and title are required', retryable: false };
  const o = resolveOwner(owner);
  const res = await axios.post(`${GH_API}/repos/${o}/${repo}/issues`, { title, body }, { headers: ghHeaders() });
  return {
    success: true,
    data: { number: res.data.number, title: res.data.title, url: res.data.html_url, state: res.data.state },
  };
}

async function listIssues({ repo, owner, state = 'open' }) {
  if (!repo) return { success: false, error: 'repo is required', retryable: false };
  const o = resolveOwner(owner);
  const res = await axios.get(`${GH_API}/repos/${o}/${repo}/issues`, {
    headers: ghHeaders(),
    params: { state, per_page: 20 },
  });
  const issues = res.data.map((i) => ({ number: i.number, title: i.title, state: i.state, url: i.html_url, createdAt: i.created_at }));
  return { success: true, data: { repo, issues } };
}

module.exports = tool;

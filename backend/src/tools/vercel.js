'use strict';

const axios = require('axios');
const config = require('../config/env');
const logger = require('../utils/logger');

const VERCEL_API = 'https://api.vercel.com';

const tool = {
  name: 'vercel',
  description: 'Interact with Vercel — list projects, inspect project details, trigger deployments, and check deployment status.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['listProjects', 'inspectProject', 'deploy', 'inspectDeployment', 'listDeployments'],
        description: 'Vercel action to perform',
      },
      projectName: { type: 'string', description: 'Vercel project name' },
      projectId: { type: 'string', description: 'Vercel project ID' },
      deploymentId: { type: 'string', description: 'Deployment ID or URL (for inspectDeployment)' },
      gitRepo: { type: 'string', description: 'GitHub repo in format owner/repo (for deploy)' },
      gitBranch: { type: 'string', description: 'Branch to deploy (default: main)' },
      production: { type: 'boolean', description: 'Deploy to production (default: false, preview deploy)' },
    },
    required: ['action'],
  },
  requiredCredentials: ['VERCEL_TOKEN'],

  async execute(args) {
    if (!config.vercelToken) {
      return {
        success: false,
        error: 'Vercel is not configured. Add VERCEL_TOKEN to your .env file.',
        retryable: false,
      };
    }

    const { action } = args;
    logger.tool('vercel', action, args.projectName || args.deploymentId || '');

    try {
      switch (action) {
        case 'listProjects': return await listProjects();
        case 'inspectProject': return await inspectProject(args);
        case 'deploy': return await deploy(args);
        case 'inspectDeployment': return await inspectDeployment(args);
        case 'listDeployments': return await listDeployments(args);
        default:
          return { success: false, error: `Unknown vercel action: ${action}`, retryable: false };
      }
    } catch (err) {
      logger.error('[VERCEL] Error:', err.message);
      const status = err.response?.status;
      const msg = err.response?.data?.error?.message || err.message;
      return {
        success: false,
        error: `Vercel API error (${status || 'network'}): ${msg}`,
        retryable: status >= 500,
      };
    }
  },
};

function vercelHeaders() {
  return { Authorization: `Bearer ${config.vercelToken}` };
}

function teamParams() {
  return config.vercelTeamId ? { teamId: config.vercelTeamId } : {};
}

async function listProjects() {
  const res = await axios.get(`${VERCEL_API}/v9/projects`, {
    headers: vercelHeaders(),
    params: { ...teamParams(), limit: 20 },
  });

  const projects = (res.data.projects || []).map((p) => ({
    id: p.id,
    name: p.name,
    framework: p.framework,
    updatedAt: p.updatedAt,
    latestDeployment: p.latestDeployments?.[0]
      ? {
          id: p.latestDeployments[0].uid,
          url: `https://${p.latestDeployments[0].url}`,
          state: p.latestDeployments[0].readyState,
          createdAt: p.latestDeployments[0].createdAt,
        }
      : null,
  }));

  return { success: true, data: { projects } };
}

async function inspectProject({ projectName, projectId }) {
  const identifier = projectId || projectName;
  if (!identifier) return { success: false, error: 'projectName or projectId is required', retryable: false };

  const res = await axios.get(`${VERCEL_API}/v9/projects/${identifier}`, {
    headers: vercelHeaders(),
    params: teamParams(),
  });

  const p = res.data;
  return {
    success: true,
    data: {
      id: p.id,
      name: p.name,
      framework: p.framework,
      nodeVersion: p.nodeVersion,
      gitRepo: p.link ? `${p.link.org}/${p.link.repo}` : null,
      productionBranch: p.link?.productionBranch || 'main',
      domains: (p.alias || []).map((a) => a.domain),
    },
  };
}

async function deploy({ projectName, gitRepo, gitBranch = 'main', production = false }) {
  if (!projectName) return { success: false, error: 'projectName is required', retryable: false };

  // Vercel deploy via createDeployment
  const body = {
    name: projectName,
    target: production ? 'production' : 'preview',
    ...(gitRepo && {
      gitSource: {
        type: 'github',
        org: gitRepo.split('/')[0],
        repo: gitRepo.split('/')[1],
        ref: gitBranch,
      },
    }),
  };

  const res = await axios.post(`${VERCEL_API}/v13/deployments`, body, {
    headers: { ...vercelHeaders(), 'Content-Type': 'application/json' },
    params: teamParams(),
  });

  const d = res.data;
  logger.tool('vercel', 'deploy', `Started: ${d.id}`);

  return {
    success: true,
    data: {
      deploymentId: d.id,
      url: `https://${d.url}`,
      state: d.readyState,
      target: production ? 'production' : 'preview',
      inspectUrl: d.inspectorUrl,
      note: 'Deployment initiated. Use inspectDeployment to check status.',
    },
  };
}

async function inspectDeployment({ deploymentId }) {
  if (!deploymentId) return { success: false, error: 'deploymentId is required', retryable: false };

  const res = await axios.get(`${VERCEL_API}/v13/deployments/${deploymentId}`, {
    headers: vercelHeaders(),
    params: teamParams(),
  });

  const d = res.data;
  const stateEmoji = { READY: '✅', ERROR: '❌', BUILDING: '🔨', QUEUED: '⏳', CANCELED: '🚫' };

  return {
    success: true,
    data: {
      id: d.id,
      url: `https://${d.url}`,
      state: d.readyState,
      stateEmoji: stateEmoji[d.readyState] || '❓',
      ready: d.readyState === 'READY',
      error: d.errorMessage || null,
      createdAt: d.createdAt,
      buildingAt: d.buildingAt,
      readyAt: d.ready,
    },
  };
}

async function listDeployments({ projectName, limit = 10 }) {
  const params = { ...teamParams(), limit };
  if (projectName) params.projectId = projectName;

  const res = await axios.get(`${VERCEL_API}/v6/deployments`, {
    headers: vercelHeaders(),
    params,
  });

  const deployments = (res.data.deployments || []).map((d) => ({
    id: d.uid,
    url: `https://${d.url}`,
    state: d.readyState,
    target: d.target,
    createdAt: d.createdAt,
  }));

  return { success: true, data: { deployments } };
}

module.exports = tool;

'use strict';

const axios = require('axios');
const config = require('../config/env');
const logger = require('../utils/logger');

const tool = {
  name: 'webSearch',
  description: 'Search the web for current information, news, prices, documentation, or any publicly available content. Also can fetch a specific URL to read its content.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['search', 'fetch'],
        description: '"search" to query the web, "fetch" to retrieve a specific URL',
      },
      query: {
        type: 'string',
        description: 'Search query string (required for search)',
      },
      url: {
        type: 'string',
        description: 'URL to fetch (required for fetch)',
      },
      numResults: {
        type: 'number',
        description: 'Number of search results to return (default 5)',
      },
    },
    required: ['action'],
  },
  requiredCredentials: ['WEB_SEARCH_API_KEY'],
  permissionLevel: 'LOW',
  requiresConfirmation: false,

  async execute({ action, query, url, numResults = 5 }) {
    if (!config.webSearchApiKey) {
      return {
        success: false,
        error: 'Web search is not configured. Add WEB_SEARCH_API_KEY to your .env file.',
        retryable: false,
      };
    }

    if (action === 'search') {
      return await searchWeb(query, numResults);
    } else if (action === 'fetch') {
      return await fetchUrl(url);
    }

    return { success: false, error: `Unknown action: ${action}`, retryable: false };
  },
};

async function searchWeb(query, numResults) {
  if (!query) {
    return { success: false, error: 'Search query is required', retryable: false };
  }

  logger.tool('web', 'search', query);

  try {
    if (config.webSearchProvider === 'serper') {
      return await searchViaSerper(query, numResults);
    } else if (config.webSearchProvider === 'serpapi') {
      return await searchViaSerpAPI(query, numResults);
    } else {
      return {
        success: false,
        error: `Unknown WEB_SEARCH_PROVIDER: ${config.webSearchProvider}. Use "serper" or "serpapi".`,
        retryable: false,
      };
    }
  } catch (err) {
    logger.error('[WEB] Search error:', err.message);
    return {
      success: false,
      error: `Web search failed: ${err.message}`,
      retryable: true,
    };
  }
}

async function searchViaSerper(query, numResults) {
  const res = await axios.post(
    'https://google.serper.dev/search',
    { q: query, num: numResults },
    {
      headers: {
        'X-API-KEY': config.webSearchApiKey,
        'Content-Type': 'application/json',
      },
    }
  );

  const organic = res.data.organic || [];
  const answerBox = res.data.answerBox || null;
  const knowledgeGraph = res.data.knowledgeGraph || null;

  const results = organic.slice(0, numResults).map((r) => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet,
  }));

  return {
    success: true,
    data: {
      query,
      answerBox: answerBox ? { title: answerBox.title, answer: answerBox.answer || answerBox.snippet } : null,
      knowledgeGraph: knowledgeGraph ? { title: knowledgeGraph.title, description: knowledgeGraph.description } : null,
      results,
    },
  };
}

async function searchViaSerpAPI(query, numResults) {
  const res = await axios.get('https://serpapi.com/search', {
    params: {
      q: query,
      api_key: config.webSearchApiKey,
      num: numResults,
      engine: 'google',
    },
  });

  const organic = res.data.organic_results || [];
  const results = organic.slice(0, numResults).map((r) => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet,
  }));

  return { success: true, data: { query, results } };
}

async function fetchUrl(url) {
  if (!url) {
    return { success: false, error: 'URL is required for fetch action', retryable: false };
  }

  logger.tool('web', 'fetch', url);

  try {
    const res = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SERA-Bot/1.0)' },
      timeout: 10000,
      maxContentLength: 500000, // 500KB limit
    });

    // Extract text content (basic extraction — no heavy HTML parsing)
    let content = res.data;
    if (typeof content === 'string') {
      // Remove script/style tags
      content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
      content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
      // Remove HTML tags
      content = content.replace(/<[^>]+>/g, ' ');
      // Clean whitespace
      content = content.replace(/\s+/g, ' ').trim();
      // Limit to first 3000 chars to stay in token budget
      content = content.slice(0, 3000);
    }

    return {
      success: true,
      data: { url, content, contentType: res.headers['content-type'] || 'unknown' },
    };
  } catch (err) {
    logger.error('[WEB] Fetch error:', err.message);
    return {
      success: false,
      error: `Could not fetch ${url}: ${err.message}`,
      retryable: false,
    };
  }
}

module.exports = tool;

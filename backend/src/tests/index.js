'use strict';

/**
 * SERA Test Suite
 * Run with: npm test
 */

// Minimal test harness (no dependencies)
let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      result.then(() => {
        console.log(`  ✅ ${name}`);
        passed++;
      }).catch((err) => {
        console.log(`  ❌ ${name}: ${err.message}`);
        failed++;
        failures.push({ name, error: err.message });
      });
    } else {
      console.log(`  ✅ ${name}`);
      passed++;
    }
  } catch (err) {
    console.log(`  ❌ ${name}: ${err.message}`);
    failed++;
    failures.push({ name, error: err.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(a, b, message) {
  if (a !== b) throw new Error(message || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// ─── Set up minimal env so config doesn't exit ───────────────────────────────
process.env.VERIFY_TOKEN = 'test_verify_token';
process.env.META_ACCESS_TOKEN = 'test_meta_token';
process.env.WHATSAPP_PHONE_NUMBER_ID = '1234567890';
process.env.GEMINI_API_KEY = 'test_gemini_key';
process.env.ALLOWED_WHATSAPP_NUMBERS = '15551234567,15559876543';
process.env.WORKSPACE_PATH = '/tmp/sera_test_workspace';
process.env.NODE_ENV = 'test';

// ─── Tests ────────────────────────────────────────────────────────────────────

console.log('\n🔍 SERA Test Suite\n');

// 1. Config
console.log('📋 Config');
const config = require('../config/env');
test('Config loads without error', () => {
  assert(config.port > 0, 'Port must be positive');
  assert(config.verifyToken === 'test_verify_token', 'VERIFY_TOKEN loaded');
  assert(config.allowedNumbers.length === 2, 'Two allowed numbers loaded');
});

test('Config parses allowed numbers correctly', () => {
  // Numbers should be digits-only, no +, no spaces
  assert(config.allowedNumbers.every(n => /^\d+$/.test(n)), 'All numbers are digits-only');
  assertEqual(config.allowedNumbers[0], '15551234567', 'First number correct');
  assertEqual(config.allowedNumbers[1], '15559876543', 'Second number correct');
});

// 2. Auth
console.log('\n🔐 Authorization');
const { isAuthorized, normalizeNumber, UNAUTHORIZED_MESSAGE } = require('../security/auth');

test('Authorized number is accepted', () => {
  assert(isAuthorized('15551234567'), 'Should accept authorized number');
});

test('Authorized number with + prefix is accepted', () => {
  assert(isAuthorized('+15551234567'), 'Should accept number with + prefix');
});

test('Unauthorized number is rejected', () => {
  assert(!isAuthorized('19999999999'), 'Should reject unknown number');
});

test('Empty string is rejected', () => {
  assert(!isAuthorized(''), 'Should reject empty string');
});

test('normalizeNumber strips non-digits', () => {
  assertEqual(normalizeNumber('+1 (555) 123-4567'), '15551234567', 'Normalize strips formatting');
});

test('UNAUTHORIZED_MESSAGE does not expose internal info', () => {
  assert(!UNAUTHORIZED_MESSAGE.includes('token'), 'No token in unauthorized message');
  assert(!UNAUTHORIZED_MESSAGE.includes('API'), 'No API mention in unauthorized message');
  assert(UNAUTHORIZED_MESSAGE.length > 0, 'Message is not empty');
});

// 3. Memory
console.log('\n🧠 Memory');
const memory = require('../memory/memory');

test('Can add and retrieve history', () => {
  memory.addMessage('test_user', 'user', 'Hello');
  const history = memory.getHistory('test_user');
  assert(history.length === 1, 'History has one message');
  assertEqual(history[0].content, 'Hello', 'Message content correct');
});

test('History is trimmed to MAX_HISTORY', () => {
  for (let i = 0; i < 25; i++) {
    memory.addMessage('trim_test_user', 'user', `Message ${i}`);
  }
  const history = memory.getHistory('trim_test_user');
  assert(history.length <= 20, 'History trimmed to max');
});

test('Pending confirmation flow works', () => {
  const pending = { toolName: 'gmail', actionName: 'send', args: { to: 'test@test.com', subject: 'Test', body: 'Hello' } };
  memory.setPending('confirm_user', pending);
  const retrieved = memory.getPending('confirm_user');
  assert(retrieved !== null, 'Pending is stored');
  assertEqual(retrieved.toolName, 'gmail', 'Pending tool name correct');

  memory.clearPending('confirm_user');
  assert(memory.getPending('confirm_user') === null, 'Pending is cleared');
});

test('isConfirmation recognizes yes variants', () => {
  const yesWords = ['yes', 'Yes', 'YES', 'y', 'yep', 'sure', 'ok', 'okay', 'go ahead', 'do it', 'confirm'];
  for (const w of yesWords) {
    assert(memory.isConfirmation(w), `"${w}" should be confirmation`);
  }
});

test('isRejection recognizes no variants', () => {
  const noWords = ['no', 'No', 'n', 'nope', 'cancel', 'stop', 'abort'];
  for (const w of noWords) {
    assert(memory.isRejection(w), `"${w}" should be rejection`);
  }
});

// 4. File Security
console.log('\n📁 File Security');
const fs = require('fs');

// Create test workspace
if (!fs.existsSync('/tmp/sera_test_workspace')) {
  fs.mkdirSync('/tmp/sera_test_workspace', { recursive: true });
}

test('Files tool rejects path traversal', () => {
  const filesTool = require('../tools/files');
  const result = filesTool.execute({ action: 'read', filename: '../../../etc/passwd' });
  if (result instanceof Promise) {
    return result.then(r => {
      assert(!r.success, 'Path traversal should fail');
    });
  }
  // Sync check
});

test('Files tool rejects absolute paths', () => {
  const filesTool = require('../tools/files');
  const result = filesTool.execute({ action: 'read', filename: '/etc/passwd' });
  return (result instanceof Promise ? result : Promise.resolve(result)).then(r => {
    assert(!r.success, 'Absolute path should fail');
  });
});

test('Files tool can create and read files in workspace', () => {
  const filesTool = require('../tools/files');
  return filesTool.execute({ action: 'create', filename: 'test_file.txt', content: 'Hello SERA' })
    .then(r => {
      assert(r.success, 'File should be created');
      return filesTool.execute({ action: 'read', filename: 'test_file.txt' });
    })
    .then(r => {
      assert(r.success, 'File should be read');
      assertEqual(r.data.content, 'Hello SERA', 'Content matches');
      // Clean up
      fs.unlinkSync('/tmp/sera_test_workspace/test_file.txt');
    });
});

// 5. Permissions
console.log('\n🛡️  Permissions');
const { requiresConfirmation, buildConfirmationMessage } = require('../security/permissions');

test('gmail.send requires confirmation', () => {
  assert(requiresConfirmation('gmail', 'send'), 'Sending email should require confirmation');
});

test('gmail.list does not require confirmation', () => {
  assert(!requiresConfirmation('gmail', 'list'), 'Listing emails should not require confirmation');
});

test('github.createRepo requires confirmation', () => {
  assert(requiresConfirmation('github', 'createRepo'), 'Creating repo should require confirmation');
});

test('github.listRepos does not require confirmation', () => {
  assert(!requiresConfirmation('github', 'listRepos'), 'Listing repos should not require confirmation');
});

test('vercel.deploy requires confirmation', () => {
  assert(requiresConfirmation('vercel', 'deploy'), 'Deploying should require confirmation');
});

test('web.search does not require confirmation', () => {
  assert(!requiresConfirmation('web', 'search'), 'Web search should not require confirmation');
});

test('Confirmation message is built correctly for gmail.send', () => {
  const msg = buildConfirmationMessage('gmail', 'send', {
    to: 'test@example.com',
    subject: 'Hello',
    body: 'Test body'
  });
  assert(msg.includes('test@example.com'), 'Confirmation message includes recipient');
  assert(msg.includes('Hello'), 'Confirmation message includes subject');
});

// 6. Logger security
console.log('\n📝 Logger Security');
const logger = require('../utils/logger');

test('Logger does not output Bearer tokens', () => {
  let output = '';
  const origLog = console.log;
  console.log = (msg) => { output += msg; };
  logger.info('Authorization: Bearer eyJhbGciOiJSUzI1NiJ9.secret.token');
  console.log = origLog;
  assert(!output.includes('eyJhbGciOiJSUzI1NiJ9'), 'Token should be redacted');
});

// 7. Tool Registry
console.log('\n🔧 Tool Registry');
const { getAllTools, getTool } = require('../tools/index');

test('All tools are registered', () => {
  const tools = getAllTools();
  const names = tools.map(t => t.name);
  assert(names.includes('webSearch'), 'webSearch registered');
  assert(names.includes('gmail'), 'gmail registered');
  assert(names.includes('files'), 'files registered');
  assert(names.includes('github'), 'github registered');
  assert(names.includes('vercel'), 'vercel registered');
  assert(names.includes('reminders'), 'reminders registered');
});

test('getTool returns correct tool', () => {
  const tool = getTool('gmail');
  assert(tool !== null, 'gmail tool found');
  assert(typeof tool.execute === 'function', 'Tool has execute function');
  assert(tool.inputSchema !== undefined, 'Tool has input schema');
});

test('Unknown tool returns null', () => {
  const tool = getTool('nonexistentTool');
  assertEqual(tool, null, 'Unknown tool returns null');
});

// 8. Web tool — unconfigured state
console.log('\n🌐 Web Tool');
test('Web tool reports not configured when no API key', () => {
  const originalKey = process.env.WEB_SEARCH_API_KEY;
  delete process.env.WEB_SEARCH_API_KEY;
  // Re-require config to pick up change
  const webTool = require('../tools/web');
  const result = webTool.execute({ action: 'search', query: 'test' });
  process.env.WEB_SEARCH_API_KEY = originalKey || '';
  return (result instanceof Promise ? result : Promise.resolve(result)).then(r => {
    assert(!r.success, 'Should fail when not configured');
    assert(r.error.includes('not configured') || r.error.includes('WEB_SEARCH_API_KEY'), 'Error message mentions configuration');
  });
});

// 9. Webhook parsing
console.log('\n📨 Webhook');
test('Webhook verification checks token', () => {
  const { handleVerification } = require('../whatsapp/webhook');
  let statusCode = 0;
  const req = {
    query: {
      'hub.mode': 'subscribe',
      'hub.verify_token': 'test_verify_token',
      'hub.challenge': 'test_challenge_123',
    }
  };
  const res = {
    status: (code) => { statusCode = code; return { send: (body) => body }; },
    json: () => {},
  };
  const result = handleVerification(req, res);
  assertEqual(statusCode, 200, 'Valid token returns 200');
  assertEqual(result, 'test_challenge_123', 'Challenge echoed back');
});

test('Webhook rejects invalid verify token', () => {
  const { handleVerification } = require('../whatsapp/webhook');
  let statusCode = 0;
  const req = {
    query: {
      'hub.mode': 'subscribe',
      'hub.verify_token': 'WRONG_TOKEN',
      'hub.challenge': 'test_challenge',
    }
  };
  const res = {
    status: (code) => { statusCode = code; return { json: () => {} }; },
  };
  handleVerification(req, res);
  assertEqual(statusCode, 403, 'Wrong token returns 403');
});

// 10. Reminders
console.log('\n⏰ Reminders');
test('Reminder tool rejects past datetime', () => {
  const remindersTool = require('../tools/reminders');
  const result = remindersTool.execute({ action: 'create', text: 'Test', datetime: '2020-01-01T10:00:00' });
  return (result instanceof Promise ? result : Promise.resolve(result)).then(r => {
    assert(!r.success, 'Past reminder should fail');
    assert(r.error.includes('future'), 'Error mentions future');
  });
});

test('Reminder list returns empty when no reminders set', () => {
  const remindersTool = require('../tools/reminders');
  const result = remindersTool.execute({ action: 'list' });
  return (result instanceof Promise ? result : Promise.resolve(result)).then(r => {
    assert(r.success, 'List should succeed');
    assert(Array.isArray(r.data.reminders), 'Returns array');
  });
});

// ─── Results ──────────────────────────────────────────────────────────────────
setTimeout(() => {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    failures.forEach(f => console.log(`   • ${f.name}: ${f.error}`));
  }
  console.log(`${'─'.repeat(50)}\n`);

  if (failed > 0) process.exit(1);
}, 2000); // Wait for async tests

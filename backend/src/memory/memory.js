'use strict';

/**
 * SERA Memory — v0.1 in-memory store.
 *
 * Stores per-user:
 *   - conversation history (for Gemini context)
 *   - pending confirmation (awaiting yes/no from user)
 *   - task state
 *
 * This module is designed so the storage backend can be swapped later
 * (PostgreSQL, Redis, Supabase) without changing the interface.
 */

// Map<userId, { history: [], pending: null, taskState: string }>
const store = new Map();

const MAX_HISTORY = 20; // Keep last N messages per user to avoid token bloat

function getUser(userId) {
  if (!store.has(userId)) {
    store.set(userId, {
      history: [],
      pending: null, // { tool, action, args, confirmationMessage }
      taskState: 'idle', // idle | planning | awaiting_info | awaiting_confirmation | executing | done
    });
  }
  return store.get(userId);
}

// --- Conversation History ---

function addMessage(userId, role, content) {
  const user = getUser(userId);
  user.history.push({ role, content });
  // Trim to max
  if (user.history.length > MAX_HISTORY) {
    user.history = user.history.slice(user.history.length - MAX_HISTORY);
  }
}

function getHistory(userId) {
  return getUser(userId).history;
}

function clearHistory(userId) {
  getUser(userId).history = [];
}

// --- Pending Confirmation ---

function setPending(userId, pendingAction) {
  // pendingAction: { tool, action, args, confirmationMessage }
  const user = getUser(userId);
  user.pending = pendingAction;
  user.taskState = 'awaiting_confirmation';
}

function getPending(userId) {
  return getUser(userId).pending;
}

function clearPending(userId) {
  const user = getUser(userId);
  user.pending = null;
  user.taskState = 'idle';
}

// --- Task State ---

function setTaskState(userId, state) {
  getUser(userId).taskState = state;
}

function getTaskState(userId) {
  return getUser(userId).taskState;
}

// --- Check if user said "yes" to a confirmation ---

function isConfirmation(text) {
  const t = text.trim().toLowerCase();
  return ['yes', 'y', 'yep', 'yeah', 'sure', 'ok', 'okay', 'go ahead', 'do it', 'send it', 'confirm', 'proceed'].includes(t);
}

function isRejection(text) {
  const t = text.trim().toLowerCase();
  return ['no', 'n', 'nope', 'cancel', 'stop', 'abort', 'don\'t', 'dont'].includes(t);
}

module.exports = {
  addMessage,
  getHistory,
  clearHistory,
  setPending,
  getPending,
  clearPending,
  setTaskState,
  getTaskState,
  isConfirmation,
  isRejection,
};

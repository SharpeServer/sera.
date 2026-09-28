# SERA — Personal AI Operator

SERA is a personal AI operator that works entirely through WhatsApp. Give it tasks. SERA plans, executes connected tools, and reports results back on WhatsApp.

**There is no web chat interface.** The website is a landing/connect page only.

---

## Architecture

```
You (WhatsApp)
      ↓
Meta WhatsApp Cloud API
      ↓
SERA Backend (Express)
      ↓
Gemini AI (function calling)
      ↓
Tool Registry
  ├── Web Search (Serper/SerpAPI)
  ├── Gmail (Google API)
  ├── Files (sandboxed workspace)
  ├── GitHub (GitHub API)
  ├── Vercel (Vercel API)
  └── Reminders (node-cron)
      ↓
WhatsApp reply
```

---

## Phase Status

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | ✅ Ready | WhatsApp ↔ SERA ↔ Gemini core |
| 2 | ✅ Ready | Web search (Serper or SerpAPI) |
| 3 | ✅ Ready | Gmail (read, search, send) |
| 4 | ✅ Ready | Files (sandboxed workspace) |
| 5 | ✅ Ready | GitHub (repos, files, issues) |
| 6 | ✅ Ready | Vercel (list, deploy, status) |
| 7 | ✅ Ready | Reminders (cron-based) |
| 8 | 🔜 Future | Persistent memory (Postgres/Redis) |

---

## Prerequisites

- Node.js 18+
- A Meta Developer account
- A WhatsApp Business account connected in Meta
- A Google Cloud account (for Gmail OAuth)
- API accounts for your chosen tools (GitHub, Vercel, Serper, etc.)
- A public HTTPS URL for the webhook (e.g. via [ngrok](https://ngrok.com) for dev, or deploy to Render/Railway/Fly.io)

---

## Setup

### 1. Install dependencies

```bash
cd backend
npm install
```

### 2. Create your .env file

```bash
cp .env.example .env
```

Fill in all values — see the section-by-section guide below.

### 3. Add your Gemini API key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create an API key
3. Set `GEMINI_API_KEY=your_key` in `.env`

### 4. Configure Meta WhatsApp Cloud API

1. Go to [Meta for Developers](https://developers.facebook.com)
2. Create an app → Add WhatsApp product
3. Under **WhatsApp → API Setup**:
   - Copy your **Phone Number ID** → `WHATSAPP_PHONE_NUMBER_ID`
   - Generate a **permanent access token** → `META_ACCESS_TOKEN`
4. Choose a `VERIFY_TOKEN` (any secret string you pick) → set in `.env`

### 5. Set your webhook URL

Your backend must be publicly reachable over HTTPS.

**For local development** (using ngrok):
```bash
ngrok http 3000
# Copy the https URL, e.g. https://abc123.ngrok.io
```

**Configure the webhook in Meta:**
1. In Meta Developer Portal → WhatsApp → Configuration → Webhook
2. Set **Callback URL**: `https://YOUR_URL/webhook`
3. Set **Verify Token**: same as your `VERIFY_TOKEN` in `.env`
4. Subscribe to: `messages`
5. Click **Verify and Save**

### 6. Add your authorized WhatsApp number

```env
ALLOWED_WHATSAPP_NUMBERS=15551234567
```

Use your full number with country code, no `+`, no spaces.

### 7. Start SERA

```bash
# Development (auto-restarts on file change)
npm run dev

# Production
npm start
```

Check the health endpoint:
```
GET http://localhost:3000/health
```

---

## Gmail Setup (OAuth)

Gmail requires one-time OAuth authorization to get a refresh token.

1. Create OAuth credentials in [Google Cloud Console](https://console.cloud.google.com):
   - APIs & Services → Credentials → Create OAuth 2.0 Client ID
   - Application type: **Web application**
   - Authorized redirect URI: `http://localhost:3000/auth/gmail/callback`
2. Enable **Gmail API** in your Google Cloud project
3. Set in `.env`:
   ```env
   GMAIL_CLIENT_ID=...
   GMAIL_CLIENT_SECRET=...
   GMAIL_REDIRECT_URI=http://localhost:3000/auth/gmail/callback
   ```
4. Run SERA, then visit: `http://localhost:3000/auth/gmail`
5. Authorize with your Google account
6. Copy the displayed `GMAIL_REFRESH_TOKEN` into your `.env`
7. Restart SERA

---

## Web Search Setup

SERA supports two providers. Pick one:

**Serper** (recommended, generous free tier):
```env
WEB_SEARCH_PROVIDER=serper
WEB_SEARCH_API_KEY=your_key  # from https://serper.dev
```

**SerpAPI**:
```env
WEB_SEARCH_PROVIDER=serpapi
WEB_SEARCH_API_KEY=your_key  # from https://serpapi.com
```

---

## GitHub Setup

1. Go to GitHub → Settings → Developer Settings → Personal Access Tokens
2. Create a token with scopes: `repo`, `delete_repo` (if you want delete support)
3. Set in `.env`:
   ```env
   GITHUB_TOKEN=ghp_...
   GITHUB_USERNAME=your_username
   ```

---

## Vercel Setup

1. Go to Vercel → Settings → Tokens → Create Token
2. Set in `.env`:
   ```env
   VERCEL_TOKEN=...
   VERCEL_TEAM_ID=  # leave empty for personal accounts
   ```

---

## Files / Workspace

SERA can read and write files in a sandboxed workspace directory.

```env
WORKSPACE_PATH=./workspace
```

The workspace directory is created automatically. SERA cannot access files outside this directory.

---

## Running Tests

```bash
npm test
```

The test suite covers:
- Config loading
- WhatsApp number authorization
- Memory and confirmation flow
- File security (path traversal protection)
- Permission levels for all tools
- Logger secret sanitization
- Tool registry completeness
- Webhook verification

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | `development` or `production` |
| `VERIFY_TOKEN` | **Yes** | Secret token for webhook verification |
| `META_ACCESS_TOKEN` | **Yes** | Meta Graph API permanent access token |
| `WHATSAPP_PHONE_NUMBER_ID` | **Yes** | WhatsApp phone number ID |
| `GEMINI_API_KEY` | **Yes** | Google Gemini API key |
| `GEMINI_MODEL` | No | Gemini model (default: `gemini-1.5-pro`) |
| `ALLOWED_WHATSAPP_NUMBERS` | **Yes** | Comma-separated authorized numbers |
| `WEB_SEARCH_PROVIDER` | No | `serper` or `serpapi` |
| `WEB_SEARCH_API_KEY` | No | API key for web search provider |
| `GMAIL_CLIENT_ID` | No | Gmail OAuth client ID |
| `GMAIL_CLIENT_SECRET` | No | Gmail OAuth client secret |
| `GMAIL_REFRESH_TOKEN` | No | Gmail OAuth refresh token (from setup flow) |
| `GITHUB_TOKEN` | No | GitHub personal access token |
| `GITHUB_USERNAME` | No | GitHub username |
| `VERCEL_TOKEN` | No | Vercel API token |
| `VERCEL_TEAM_ID` | No | Vercel team ID (empty for personal) |
| `WORKSPACE_PATH` | No | Path to files workspace (default: `./workspace`) |
| `REMINDER_TIMEZONE` | No | IANA timezone (default: `UTC`) |

---

## Deployment

### Render (recommended)

1. Push to GitHub
2. New Web Service → connect your repo
3. Build command: `npm install`
4. Start command: `npm start`
5. Add all environment variables in Render dashboard
6. Copy the public URL → set as your webhook in Meta

### Railway / Fly.io

Similar steps — connect repo, set env vars, deploy.

### VPS (Nginx + PM2)

```bash
npm install -g pm2
pm2 start src/server.js --name sera
pm2 save
```

---

## Security Notes

- WhatsApp webhook signature is validated via the verify token
- Only `ALLOWED_WHATSAPP_NUMBERS` can interact with SERA
- API keys and tokens never appear in logs or WhatsApp messages
- The files tool is sandboxed to `WORKSPACE_PATH`
- Path traversal attempts are blocked
- High-risk actions (send email, deploy, create repo, delete) require explicit confirmation
- Gemini cannot execute arbitrary code or shell commands — only registered tools are callable

---

## Adding New Tools

1. Create `src/tools/mytool.js` following the existing tool structure
2. Add it to `src/tools/index.js` REGISTRY
3. Add permission entries in `src/security/permissions.js`
4. The tool will automatically be available to Gemini via function calling

---

## Project Structure

```
sera/
├── backend/
│   ├── src/
│   │   ├── server.js            # Express app + routes
│   │   ├── config/env.js        # Environment variable loader
│   │   ├── whatsapp/
│   │   │   ├── webhook.js       # Webhook verification + message handler
│   │   │   └── sendMessage.js   # Meta Graph API sender
│   │   ├── ai/
│   │   │   ├── gemini.js        # Gemini API client + function calling
│   │   │   ├── agent.js         # Agent loop + multi-step tool chaining
│   │   │   └── systemPrompt.js  # SERA system prompt
│   │   ├── tools/
│   │   │   ├── index.js         # Central tool registry
│   │   │   ├── web.js           # Web search + URL fetch
│   │   │   ├── gmail.js         # Gmail API
│   │   │   ├── files.js         # Sandboxed file operations
│   │   │   ├── github.js        # GitHub API
│   │   │   ├── vercel.js        # Vercel API
│   │   │   └── reminders.js     # Cron-based reminders
│   │   ├── memory/memory.js     # In-memory conversation + pending state
│   │   ├── security/
│   │   │   ├── auth.js          # WhatsApp number authorization
│   │   │   └── permissions.js   # Tool permission levels
│   │   ├── utils/logger.js      # Secret-sanitizing logger
│   │   └── tests/index.js       # Test suite
│   ├── workspace/               # SERA's file sandbox
│   ├── .env.example
│   ├── .gitignore
│   ├── package.json
│   └── README.md
└── website/
    ├── index.html               # Landing page
    ├── style.css
    └── script.js
```

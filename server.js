// server.js
require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const bcrypt = require('bcryptjs');

const app = express();

/* ---------------------------
   Environment + sanitization
--------------------------- */
const clean = (v) => (v ?? '').toString().trim().replace(/[\r\n"]/g, '');

const NODE_ENV           = clean(process.env.NODE_ENV) || 'development';
const PORT               = Number(clean(process.env.PORT) || 3000);
const SESSION_SECRET     = clean(process.env.SESSION_SECRET) || 'change_me_dev_only';
const ADMIN_USERNAME     = clean(process.env.ADMIN_USERNAME) || 'admin';
const ADMIN_PASSWORD_HASH= clean(process.env.ADMIN_PASSWORD_HASH);

const TIINGO_API_KEY     = clean(process.env.TIINGO_API_KEY);
const TIINGO_BASE_URL    = clean(process.env.TIINGO_BASE_URL) || 'https://api.tiingo.com';

// Helpful startup warnings
if (!TIINGO_API_KEY)     console.warn('⚠️  TIINGO_API_KEY is not set. Tiingo calls will fail.');
if (!ADMIN_PASSWORD_HASH)console.warn('⚠️  ADMIN_PASSWORD_HASH is not set. No one will be able to log in.');
if (!SESSION_SECRET)     console.warn('⚠️  SESSION_SECRET is not set. Using an insecure default (dev only).');

/* ---------------------------
   App middleware
--------------------------- */
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: NODE_ENV === 'production',
  },
}));

// Static assets (expects public/index.html and public/login.html)
app.use(express.static(path.join(__dirname, 'public')));

/* ---------------------------
   Tiingo client (sanitized)
--------------------------- */
// Strip any stray CR/LF/quotes that break headers.
// Build the exact header Tiingo expects: "Authorization: Token <KEY>"
const tiingoToken   = (TIINGO_API_KEY || '').trim().replace(/[\r\n"]/g, '');
const tiingoHeaders = {
  'Content-Type': 'application/json',
  'Authorization': `Token ${tiingoToken}`,
};

const tiingo = axios.create({
  baseURL: TIINGO_BASE_URL,
  timeout: 15000,
  headers: tiingoHeaders,
});

// Expose headers if other files import the app (optional)
app.locals.tiingoHeaders = tiingoHeaders;

/* ---------------------------
   Auth middleware (no bypass)
--------------------------- */
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  // APIs get JSON 401; pages redirect to login
  if (req.path.startsWith('/api')) return res.status(401).json({ error: 'Authentication required' });
  return res.redirect('/auth/login');
}

/* ---------------------------
   Auth routes
--------------------------- */
app.get('/auth/login', (req, res) => {
  if (req.session?.authenticated) return res.redirect('/');
  const loginPath = path.join(__dirname, 'public', 'login.html');
  res.sendFile(loginPath, (err) => {
    if (err) {
      // Fallback minimal login page if your file is missing
      res.set('Content-Type', 'text/html').send(`
        <!doctype html><meta charset="utf-8"><title>Sign in</title>
        <form method="POST" action="/auth/login" style="max-width:320px;margin:10vh auto;font-family:system-ui;">
          <h1>Sign in</h1>
          <label>Username</label>
          <input name="username" autocomplete="username" required
                 style="display:block;width:100%;margin:6px 0 12px;padding:8px">
          <label>Password</label>
          <input type="password" name="password" autocomplete="current-password" required
                 style="display:block;width:100%;margin:6px 0 12px;padding:8px">
          <button type="submit" style="padding:8px 12px">Login</button>
        </form>
      `);
    }
  });
});

app.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!ADMIN_PASSWORD_HASH) {
      return res.status(500).json({ success: false, error: 'Server not configured (ADMIN_PASSWORD_HASH missing).' });
    }

    if (clean(username) !== ADMIN_USERNAME) {
      return res.status(401).json({ success: false, error: 'Invalid credentials.' });
    }
    const ok = await bcrypt.compare(password || '', ADMIN_PASSWORD_HASH);
    if (!ok) {
      return res.status(401).json({ success: false, error: 'Invalid credentials.' });
    }

    req.session.authenticated = true;
    req.session.user = { username: ADMIN_USERNAME };
    return res.json({ success: true });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Login failed.' });
  }
});

app.get('/auth/status', (req, res) => {
  const authenticated = !!(req.session && req.session.authenticated);
  res.json({ authenticated });
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/auth/login'));
});

/* ---------------------------
   App shell
--------------------------- */
app.get('/', requireAuth, (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) res.status(200).send('<h1>PFAFF Terminal</h1><p>Logged in.</p>');
  });
});

/* ---------------------------
   Protect all /api routes
--------------------------- */
app.use('/api', requireAuth);

/* ---------------------------
   Health check for Tiingo
--------------------------- */
app.get('/api/health/tiingo', async (_req, res) => {
  try {
    const r = await tiingo.get('/api/test');
    res.json({ ok: true, tiingo: r.data });
  } catch (err) {
    const status = err?.response?.status;
    console.error('Tiingo health error:', status, err?.message);
    res.status(500).json({ ok: false, status, error: err?.message });
  }
});

/* ---------------------------
   Example Tiingo proxy routes
   (keep or adapt to your UI)
--------------------------- */

// Daily/EOD prices
app.get('/api/tiingo/daily/:ticker/prices', async (req, res) => {
  const { ticker } = req.params;
  try {
    const r = await tiingo.get(`/tiingo/daily/${encodeURIComponent(ticker)}/prices`, {
      params: req.query,
    });
    res.json(r.data);
  } catch (err) {
    const status = err?.response?.status;
    console.error('Tiingo daily error:', status, err?.message);
    res.status(status || 500).json(err?.response?.data || { error: err?.message });
  }
});

// IEX real-time/last price
app.get('/api/tiingo/iex/:ticker', async (req, res) => {
  const { ticker } = req.params;
  try {
    // Tiingo IEX uses /iex?tickers=...
    const r = await tiingo.get('/iex', {
      params: { tickers: ticker, ...req.query },
    });
    res.json(r.data);
  } catch (err) {
    const status = err?.response?.status;
    console.error('Tiingo IEX error:', status, err?.message);
    res.status(status || 500).json(err?.response?.data || { error: err?.message });
  }
});

// News feed
app.get('/api/tiingo/news', async (req, res) => {
  try {
    const r = await tiingo.get('/tiingo/news', { params: req.query });
    res.json(r.data);
  } catch (err) {
    const status = err?.response?.status;
    console.error('Tiingo news error:', status, err?.message);
    res.status(status || 500).json(err?.response?.data || { error: err?.message });
  }
});

/* ---------------------------
   404 + error handlers
--------------------------- */
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Server error' });
});

/* ---------------------------
   Start
--------------------------- */
app.listen(PORT, () => {
  console.log(`✅ Server listening on http://localhost:${PORT} (${NODE_ENV})`);
  console.log(`🔐 Auth: ${ADMIN_PASSWORD_HASH ? 'ENABLED' : 'MISCONFIGURED (set ADMIN_PASSWORD_HASH)'}`);
  console.log(`🔧 Tiingo header set: Authorization: Token ${tiingoToken ? '***' : '(missing)'}`);
});

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

// Protect dashboard page but allow login assets
app.use('/dashboard.html', requireAuth);

// Static assets (expects public/dashboard.html and public/login.html)
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
  const dashPath = path.join(__dirname, 'public', 'dashboard.html');
  res.sendFile(dashPath, (err) => {
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

// Expose API token to authenticated clients for websocket usage
app.get('/api/tiingo/token', (_req, res) => {
  res.json({ token: tiingoToken });
});

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

// IEX real-time/last price for multiple tickers
app.get('/api/tiingo/iex', async (req, res) => {
  try {
    const r = await tiingo.get('/iex', { params: req.query });
    res.json(r.data);
  } catch (err) {
    const status = err?.response?.status;
    console.error('Tiingo IEX error:', status, err?.message);
    res.status(status || 500).json(err?.response?.data || { error: err?.message });
  }
});

// IEX real-time/last price for a specific ticker
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

// Forex top-of-book / last price (multiple tickers)
app.get('/api/tiingo/fx/top', async (req, res) => {
  try {
    const r = await tiingo.get('/tiingo/fx/top', { params: req.query });
    res.json(r.data);
  } catch (err) {
    const status = err?.response?.status;
    console.error('Tiingo FX top error:', status, err?.message);
    res.status(status || 500).json(err?.response?.data || { error: err?.message });
  }
});

// Forex top-of-book / last price for a specific pair
app.get('/api/tiingo/fx/:ticker/top', async (req, res) => {
  const { ticker } = req.params;
  try {
    const r = await tiingo.get(`/tiingo/fx/${encodeURIComponent(ticker)}/top`, {
      params: req.query,
    });
    res.json(r.data);
  } catch (err) {
    const status = err?.response?.status;
    console.error('Tiingo FX pair error:', status, err?.message);
    res.status(status || 500).json(err?.response?.data || { error: err?.message });
  }
});

// Generic crypto prices (supports intraday/historical queries)
app.get('/api/tiingo/crypto/prices', async (req, res) => {
  try {
    const r = await tiingo.get('/tiingo/crypto/prices', { params: req.query });
    res.json(r.data);
  } catch (err) {
    const status = err?.response?.status;
    console.error('Tiingo crypto prices error:', status, err?.message);
    res.status(status || 500).json(err?.response?.data || { error: err?.message });
  }
});

// Fundamental definitions
app.get('/api/tiingo/fundamentals/definitions', async (_req, res) => {
  try {
    const r = await tiingo.get('/tiingo/fundamentals/definitions');
    res.json(r.data);
  } catch (err) {
    const status = err?.response?.status;
    console.error('Tiingo fundamentals error:', status, err?.message);
    res.status(status || 500).json(err?.response?.data || { error: err?.message });
  }
});

/* ---------------------------
   Frontend helper APIs
--------------------------- */

// Basic health check used by the dashboard
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    tiingoConfigured: !!TIINGO_API_KEY,
    features: {
      stocks: true,
      crypto: true,
      news: true,
      forex: true,
      fundamentals: true,
    },
  });
});

// Helper to normalize Tiingo IEX quotes into the shape expected by the UI
function normalizeQuote(q) {
  if (!q) return null;
  const change = (q.last ?? 0) - (q.prevClose ?? 0);
  return {
    symbol: q.ticker,
    price: q.last,
    change,
    changePercent: q.prevClose ? (change / q.prevClose * 100) : 0,
    volume: q.volume,
    high: q.high,
    low: q.low,
    open: q.open,
    close: q.prevClose,
    bidPrice: q.bidPrice,
    askPrice: q.askPrice,
  };
}

// Watchlist data (stocks + ETFs)
app.get('/api/stocks', async (_req, res) => {
  try {
    const tickers = 'AAPL,MSFT,GOOGL,AMZN,SPY,QQQ';
    const r = await tiingo.get('/iex', { params: { tickers } });
    const stocks = {};
    const etfs = {};
    (r.data || []).forEach((q) => {
      const item = normalizeQuote(q);
      if (!item) return;
      if (['SPY', 'QQQ'].includes(item.symbol)) etfs[item.symbol] = item;
      else stocks[item.symbol] = item;
    });
    res.json({ dataSource: 'tiingo', stocks, etfs });
  } catch (err) {
    const status = err?.response?.status;
    console.error('Stocks API error:', status, err?.message);
    res.status(status || 500).json({ error: err?.message });
  }
});

// Detailed quote for a single symbol
app.get('/api/stocks/:symbol', async (req, res) => {
  const { symbol } = req.params;
  try {
    const r = await tiingo.get('/iex', { params: { tickers: symbol } });
    const quote = normalizeQuote(r.data && r.data[0]);
    if (!quote) return res.status(404).json({ error: 'Symbol not found' });
    res.json(quote);
  } catch (err) {
    const status = err?.response?.status;
    console.error('Stock detail error:', status, err?.message);
    res.status(status || 500).json({ error: err?.message });
  }
});

// Historical data for charting
app.get('/api/stocks/:symbol/history', async (req, res) => {
  const { symbol } = req.params;
  const { period = '1M' } = req.query;
  try {
    const end = new Date();
    const start = new Date(end);
    switch (period) {
      case '1D': start.setDate(end.getDate() - 1); break;
      case '1W': start.setDate(end.getDate() - 7); break;
      case '6M': start.setMonth(end.getMonth() - 6); break;
      case '1Y': start.setFullYear(end.getFullYear() - 1); break;
      default:   start.setMonth(end.getMonth() - 1); break; // 1M
    }
    const r = await tiingo.get(`/tiingo/daily/${encodeURIComponent(symbol)}/prices`, {
      params: {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        resampleFreq: 'daily',
      },
    });
    res.json({ dataSource: 'tiingo', data: r.data });
  } catch (err) {
    const status = err?.response?.status;
    console.error('Stock history error:', status, err?.message);
    res.status(status || 500).json({ error: err?.message });
  }
});

// Basic crypto prices
app.get('/api/crypto', async (_req, res) => {
  try {
    const r = await tiingo.get('/tiingo/crypto/prices', {
      params: { tickers: 'btcusd,ethusd', resampleFreq: '1day' },
    });
    const crypto = {};
    (r.data || []).forEach((q) => {
      const base = (q.ticker || '').toUpperCase().replace('USD', '');
      crypto[base] = {
        symbol: base,
        price: q.close,
        change: q.close - q.open,
        changePercent: q.open ? ((q.close - q.open) / q.open * 100) : 0,
        volume: q.volume,
      };
    });
    res.json({ dataSource: 'tiingo', crypto });
  } catch (err) {
    const status = err?.response?.status;
    console.error('Crypto API error:', status, err?.message);
    res.status(status || 500).json({ error: err?.message });
  }
});

// Basic forex prices
app.get('/api/fx', async (_req, res) => {
  try {
    const tickers = 'eurusd,gbpusd,usdjpy';
    const r = await tiingo.get('/tiingo/fx/top', { params: { tickers } });
    const fx = {};
    (r.data || []).forEach((q) => {
      const symbol = (q.ticker || '').toUpperCase();
      fx[symbol] = {
        symbol,
        price: q.midPrice ?? q.lastPrice,
        bid: q.bidPrice,
        ask: q.askPrice,
      };
    });
    res.json({ dataSource: 'tiingo', fx });
  } catch (err) {
    const status = err?.response?.status;
    console.error('Forex API error:', status, err?.message);
    res.status(status || 500).json({ error: err?.message });
  }
});

// News articles
app.get('/api/news', async (req, res) => {
  try {
    const params = { limit: 20, ...req.query };
    const r = await tiingo.get('/tiingo/news', { params });
    res.json({ dataSource: 'tiingo', news: r.data });
  } catch (err) {
    const status = err?.response?.status;
    console.error('News API error:', status, err?.message);
    res.status(status || 500).json({ error: err?.message });
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

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const axios = require('axios');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for HTTPS (required when behind nginx/load balancer)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Security Configuration
const SESSION_SECRET = process.env.SESSION_SECRET || 'your-super-secret-session-key-change-this';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;

// Rate limiting
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login requests per windowMs
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Limit each IP to 100 requests per windowMs
});

// Enhanced security configuration for HTTPS
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      connectSrc: ["'self'", "wss:", "https:"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration with secure cookies for HTTPS
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'strict'
  }
}));

// Force HTTPS redirect middleware (when behind proxy)
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && !req.secure && req.get('x-forwarded-proto') !== 'https') {
    return res.redirect(301, `https://${req.get('host')}${req.url}`);
  }
  next();
});

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (req.session && req.session.authenticated) {
    return next();
  } else {
    return res.status(401).json({ error: 'Authentication required' });
  }
};

// Login route
app.post('/auth/login', 
  loginLimiter,
  body('username').trim().isLength({ min: 1 }).escape(),
  body('password').isLength({ min: 1 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    const { username, password } = req.body;

    try {
      if (username === ADMIN_USERNAME && ADMIN_PASSWORD_HASH) {
        const passwordMatch = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
        
        if (passwordMatch) {
          req.session.authenticated = true;
          req.session.username = username;
          res.json({ success: true, message: 'Login successful' });
        } else {
          res.status(401).json({ error: 'Invalid credentials' });
        }
      } else {
        res.status(401).json({ error: 'Invalid credentials' });
      }
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Logout route
app.post('/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out' });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

// Check authentication status
app.get('/auth/status', (req, res) => {
  res.json({ 
    authenticated: !!(req.session && req.session.authenticated),
    username: req.session?.username 
  });
});

// Serve login page for unauthenticated users
app.get('/', (req, res) => {
  if (req.session && req.session.authenticated) {
    res.sendFile(__dirname + '/public/dashboard.html');
  } else {
    res.sendFile(__dirname + '/public/login.html');
  }
});

// Serve dashboard only to authenticated users
app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(__dirname + '/public/dashboard.html');
});

// Protect all API routes
app.use('/api', apiLimiter, requireAuth);

// Static files (protected)
app.use('/static', requireAuth, express.static('public'));

// Enhanced market cache
let marketCache = {
  stocks: {},
  etfs: {},
  crypto: {},
  forex: {},
  fundamentals: {},
  news: [],
  lastUpdated: null
};

// API Configuration
const API_KEYS = {
  TIINGO: process.env.TIINGO_API_KEY,
  NEWS_API: process.env.NEWS_API_KEY
};

// Mock data for demo (replace with real Tiingo calls)
const mockStockData = {
  'AAPL': { symbol: 'AAPL', price: 185.50, change: 2.30, changePercent: '1.26', volume: 55234567 },
  'GOOGL': { symbol: 'GOOGL', price: 142.80, change: -1.20, changePercent: '-0.83', volume: 28456789 },
  'MSFT': { symbol: 'MSFT', price: 378.90, change: 5.60, changePercent: '1.50', volume: 32567890 },
  'TSLA': { symbol: 'TSLA', price: 248.50, change: -8.90, changePercent: '-3.46', volume: 89234567 },
  'SPY': { symbol: 'SPY', price: 472.30, change: 3.20, changePercent: '0.68', volume: 67890123 }
};

// Basic API routes with mock data
app.get('/api/stocks', (req, res) => {
  res.json({
    stocks: mockStockData,
    etfs: mockStockData,
    lastUpdated: new Date().toISOString()
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    authenticated: true,
    user: req.session.username
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Pfaff Terminal Dashboard running on port ${PORT}`);
  console.log(`🔒 HTTPS: ${process.env.NODE_ENV === 'production' ? 'ENABLED' : 'DEVELOPMENT MODE'}`);
  console.log(`🔐 Authentication: ${ADMIN_PASSWORD_HASH ? 'ENABLED' : 'DISABLED'}`);
  console.log(`💼 Pfaff Terminal v1.0 - Professional Financial System`);
});
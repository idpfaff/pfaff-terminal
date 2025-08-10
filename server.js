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

// Enhanced security configuration with relaxed CSP for login
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
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
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'strict'
  }
}));

// Serve static files (CSS, JS, images)
app.use(express.static('public'));

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
    console.log('Login attempt for user:', req.body.username);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({ error: 'Invalid input' });
    }

    const { username, password } = req.body;

    try {
      if (username === ADMIN_USERNAME && ADMIN_PASSWORD_HASH) {
        const passwordMatch = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
        
        if (passwordMatch) {
          req.session.authenticated = true;
          req.session.username = username;
          console.log('Login successful for user:', username);
          res.json({ success: true, message: 'Login successful' });
        } else {
          console.log('Invalid password for user:', username);
          res.status(401).json({ error: 'Invalid credentials' });
        }
      } else {
        console.log('Invalid username or missing password hash');
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

// Mock data for demo (replace with real Tiingo calls when ready)
const mockStockData = {
  'AAPL': { symbol: 'AAPL', price: 185.50, change: 2.30, changePercent: '1.26', volume: 55234567 },
  'GOOGL': { symbol: 'GOOGL', price: 142.80, change: -1.20, changePercent: '-0.83', volume: 28456789 },
  'MSFT': { symbol: 'MSFT', price: 378.90, change: 5.60, changePercent: '1.50', volume: 32567890 },
  'TSLA': { symbol: 'TSLA', price: 248.50, change: -8.90, changePercent: '-3.46', volume: 89234567 },
  'SPY': { symbol: 'SPY', price: 472.30, change: 3.20, changePercent: '0.68', volume: 67890123 },
  'QQQ': { symbol: 'QQQ', price: 389.45, change: 4.12, changePercent: '1.07', volume: 45123890 },
  'IWM': { symbol: 'IWM', price: 201.67, change: -1.23, changePercent: '-0.61', volume: 23456789 }
};

const mockCryptoData = {
  'BTCUSD': { symbol: 'BTCUSD', price: 65432.10, change: 1250.30, changePercent: '1.95', volume: 12345678 },
  'ETHUSD': { symbol: 'ETHUSD', price: 3245.67, change: -89.45, changePercent: '-2.68', volume: 8765432 },
  'ADAUSD': { symbol: 'ADAUSD', price: 0.4567, change: 0.0123, changePercent: '2.77', volume: 98765432 }
};

// Basic API routes with mock data
app.get('/api/stocks', (req, res) => {
  // Add some random variation to make it look live
  const liveStockData = {};
  const liveETFData = {};
  
  Object.keys(mockStockData).forEach(symbol => {
    const baseData = mockStockData[symbol];
    const variation = (Math.random() - 0.5) * 2; // +/- $1 variation
    liveStockData[symbol] = {
      ...baseData,
      price: parseFloat((baseData.price + variation).toFixed(2)),
      change: parseFloat((baseData.change + variation * 0.5).toFixed(2)),
      changePercent: (((baseData.change + variation * 0.5) / baseData.price) * 100).toFixed(2)
    };
  });

  // ETFs are subset of stocks for demo
  ['SPY', 'QQQ', 'IWM'].forEach(symbol => {
    if (liveStockData[symbol]) {
      liveETFData[symbol] = liveStockData[symbol];
    }
  });

  res.json({
    stocks: liveStockData,
    etfs: liveETFData,
    lastUpdated: new Date().toISOString()
  });
});

app.get('/api/crypto', (req, res) => {
  // Add some random variation to crypto
  const liveCryptoData = {};
  
  Object.keys(mockCryptoData).forEach(symbol => {
    const baseData = mockCryptoData[symbol];
    const variation = (Math.random() - 0.5) * 100; // More volatile for crypto
    liveCryptoData[symbol] = {
      ...baseData,
      price: parseFloat((baseData.price + variation).toFixed(2)),
      change: parseFloat((baseData.change + variation * 0.1).toFixed(2)),
      changePercent: (((baseData.change + variation * 0.1) / baseData.price) * 100).toFixed(2)
    };
  });

  res.json({
    crypto: liveCryptoData,
    lastUpdated: new Date().toISOString()
  });
});

app.get('/api/stocks/:symbol', async (req, res) => {
  const { symbol } = req.params;
  
  try {
    let stockData = mockStockData[symbol.toUpperCase()];
    
    if (stockData) {
      // Add some random variation
      const variation = (Math.random() - 0.5) * 2;
      const liveData = {
        ...stockData,
        price: parseFloat((stockData.price + variation).toFixed(2)),
        change: parseFloat((stockData.change + variation * 0.5).toFixed(2)),
        high: parseFloat((stockData.price + Math.abs(variation) + 2).toFixed(2)),
        low: parseFloat((stockData.price - Math.abs(variation) - 2).toFixed(2)),
        bidPrice: parseFloat((stockData.price - 0.05).toFixed(2)),
        askPrice: parseFloat((stockData.price + 0.05).toFixed(2))
      };
      res.json(liveData);
    } else {
      res.status(404).json({ error: 'Stock not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/stocks/:symbol/history', async (req, res) => {
  const { symbol } = req.params;
  const { period = '1M' } = req.query;
  
  try {
    // Generate mock historical data
    const days = period === '1W' ? 7 : period === '1M' ? 30 : period === '3M' ? 90 : 365;
    const basePrice = mockStockData[symbol.toUpperCase()]?.price || 150;
    const historicalData = [];
    
    for (let i = days; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const variation = (Math.random() - 0.5) * 10;
      const price = Math.max(50, basePrice + variation);
      
      historicalData.push({
        date: date.toISOString().split('T')[0],
        close: parseFloat(price.toFixed(2)),
        volume: Math.floor(Math.random() * 10000000)
      });
    }
    
    res.json({
      symbol: symbol.toUpperCase(),
      period: period,
      data: historicalData
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/news', (req, res) => {
  const mockNews = [
    {
      title: "Markets Open Higher Amid Tech Rally",
      source: "PFAFF NEWS",
      publishedAt: new Date().toISOString(),
      url: "#"
    },
    {
      title: "Federal Reserve Signals Rate Stability",
      source: "REUTERS",
      publishedAt: new Date(Date.now() - 3600000).toISOString(),
      url: "#"
    },
    {
      title: "Apple Reports Strong Quarterly Earnings",
      source: "CNBC",
      publishedAt: new Date(Date.now() - 7200000).toISOString(),
      url: "#"
    },
    {
      title: "Tesla Announces New Manufacturing Facility",
      source: "BLOOMBERG", 
      publishedAt: new Date(Date.now() - 10800000).toISOString(),
      url: "#"
    },
    {
      title: "Cryptocurrency Market Shows Strong Recovery",
      source: "COINDESK",
      publishedAt: new Date(Date.now() - 14400000).toISOString(),
      url: "#"
    }
  ];

  res.json({
    articles: mockNews,
    lastUpdated: new Date().toISOString()
  });
});

app.get('/api/fundamentals/:symbol', (req, res) => {
  const { symbol } = req.params;
  
  const mockFundamentals = {
    symbol: symbol.toUpperCase(),
    peRatio: 24.5 + Math.random() * 10,
    pbRatio: 3.2 + Math.random() * 2,
    eps: 6.15 + Math.random() * 2,
    dividendYield: 0.005 + Math.random() * 0.02,
    marketCap: 2900000000000 + Math.random() * 500000000000,
    revenue: 394300000000 + Math.random() * 50000000000
  };

  res.json(mockFundamentals);
});

app.get('/api/technical/:symbol', (req, res) => {
  const { symbol } = req.params;
  
  const mockTechnical = {
    symbol: symbol.toUpperCase(),
    indicators: {
      sma20: 148.5 + Math.random() * 10,
      sma50: 145.2 + Math.random() * 10,
      ema12: 149.8 + Math.random() * 10,
      rsi: 45 + Math.random() * 40
    }
  };

  res.json(mockTechnical);
});

app.get('/api/sector/:symbol', (req, res) => {
  const { symbol } = req.params;
  
  const mockSector = {
    symbol: symbol.toUpperCase(),
    sector: "TECHNOLOGY",
    industry: "CONSUMER ELECTRONICS",
    sicCode: "3571",
    companyWebsite: "https://apple.com"
  };

  res.json(mockSector);
});

// Enhanced health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    authenticated: !!(req.session && req.session.authenticated),
    user: req.session?.username,
    environment: process.env.NODE_ENV || 'development',
    features: {
      stocks: 'active',
      crypto: 'active', 
      news: 'active',
      fundamentals: 'active',
      technical: 'active'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Schedule data updates (commented out for now with mock data)
// cron.schedule('*/2 9-16 * * 1-5', updateMarketData, {
//   timezone: "America/New_York"
// });

app.listen(PORT, () => {
  console.log(`🚀 Pfaff Terminal Dashboard running on port ${PORT}`);
  console.log(`🔒 HTTPS: ${process.env.NODE_ENV === 'production' ? 'ENABLED' : 'DEVELOPMENT MODE'}`);
  console.log(`🔐 Authentication: ${ADMIN_PASSWORD_HASH ? 'ENABLED' : 'DISABLED - SET ADMIN_PASSWORD_HASH'}`);
  console.log(`💼 Pfaff Terminal v1.0 - Professional Financial System`);
  console.log(`📊 Mock data active - ready for Tiingo integration`);
});
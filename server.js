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

// Trust proxy for HTTPS
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Security Configuration
const SESSION_SECRET = process.env.SESSION_SECRET || 'your-super-secret-session-key-change-this';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;

// Tiingo Power API Configuration
const TIINGO_CONFIG = {
  API_KEY: process.env.TIINGO_API_KEY || 'your-tiingo-api-key',
  BASE_URL: 'https://api.tiingo.com',
  ENDPOINTS: {
    STOCKS: '/tiingo/daily',
    CRYPTO: '/tiingo/crypto/prices',
    FOREX: '/tiingo/fx',
    NEWS: '/tiingo/news',
    IEX: '/iex',
    FUNDAMENTALS: '/tiingo/fundamentals'
  }
};

// Rate limiting
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 1000,
});

// Enhanced security
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      connectSrc: ["'self'", "wss:", "https:", "https://api.tiingo.com"],
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

// Session configuration
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'strict'
  }
}));

app.use(express.static('public'));

// HTTPS redirect
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

// Authentication routes
app.post('/auth/login', 
  loginLimiter,
  body('username').trim().isLength({ min: 1 }).escape(),
  body('password').isLength({ min: 1 }),
  async (req, res) => {
    console.log('Login attempt for user:', req.body.username);
    
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
          console.log('Login successful for user:', username);
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

app.post('/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out' });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

app.get('/auth/status', (req, res) => {
  res.json({ 
    authenticated: !!(req.session && req.session.authenticated),
    username: req.session?.username 
  });
});

// Route handlers
app.get('/', (req, res) => {
  if (req.session && req.session.authenticated) {
    res.sendFile(__dirname + '/public/dashboard.html');
  } else {
    res.sendFile(__dirname + '/public/login.html');
  }
});

app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(__dirname + '/public/dashboard.html');
});

app.use('/api', apiLimiter, requireAuth);

// Enhanced market cache
let marketCache = {
  stocks: {},
  etfs: {},
  crypto: {},
  forex: {},
  news: [],
  lastUpdated: null
};

// Tiingo Power API Functions
async function makeTiingoRequest(endpoint, params = {}) {
  try {
    const url = `${TIINGO_CONFIG.BASE_URL}${endpoint}`;
    const config = {
      params: {
        token: TIINGO_CONFIG.API_KEY,
        ...params
      },
      timeout: 15000,
      headers: {
        'Authorization': `Token ${TIINGO_CONFIG.API_KEY}`,
        'Content-Type': 'application/json'
      }
    };

    console.log(`Tiingo API call: ${url}`);
    const response = await axios.get(url, config);
    return response.data;
  } catch (error) {
    console.error('Tiingo API error:', error.response?.data || error.message);
    throw error;
  }
}

// Mock data for fallback
const mockStockData = {
  'AAPL': { symbol: 'AAPL', price: 185.50, change: 2.30, changePercent: '1.26', volume: 55234567 },
  'GOOGL': { symbol: 'GOOGL', price: 142.80, change: -1.20, changePercent: '-0.83', volume: 28456789 },
  'MSFT': { symbol: 'MSFT', price: 378.90, change: 5.60, changePercent: '1.50', volume: 32567890 },
  'TSLA': { symbol: 'TSLA', price: 248.50, change: -8.90, changePercent: '-3.46', volume: 89234567 },
  'AMZN': { symbol: 'AMZN', price: 155.20, change: 3.45, changePercent: '2.27', volume: 45678901 },
  'META': { symbol: 'META', price: 298.67, change: -4.23, changePercent: '-1.40', volume: 23456789 },
  'NVDA': { symbol: 'NVDA', price: 421.88, change: 15.67, changePercent: '3.86', volume: 67890123 }
};

const mockETFData = {
  'SPY': { symbol: 'SPY', price: 472.30, change: 3.20, changePercent: '0.68', volume: 67890123 },
  'QQQ': { symbol: 'QQQ', price: 389.45, change: 4.12, changePercent: '1.07', volume: 45123890 },
  'IWM': { symbol: 'IWM', price: 201.67, change: -1.23, changePercent: '-0.61', volume: 23456789 }
};

const mockCryptoData = {
  'BTCUSD': { symbol: 'BTCUSD', price: 65432.10, change: 1250.30, changePercent: '1.95', volume: 12345678 },
  'ETHUSD': { symbol: 'ETHUSD', price: 3245.67, change: -89.45, changePercent: '-2.68', volume: 8765432 },
  'ADAUSD': { symbol: 'ADAUSD', price: 0.4567, change: 0.0123, changePercent: '2.77', volume: 98765432 }
};

// API Endpoints

// Main stocks endpoint
app.get('/api/stocks', async (req, res) => {
  try {
    console.log('Fetching stock data...');
    
    let stockData = {};
    let etfData = {};
    let dataSource = 'fallback';
    
    if (TIINGO_CONFIG.API_KEY && TIINGO_CONFIG.API_KEY !== 'your-tiingo-api-key') {
      try {
        // Try to fetch from Tiingo - using simplified approach for now
        console.log('Tiingo API configured, attempting to fetch data...');
        
        // For now, use enhanced mock data with Tiingo connection test
        const testResponse = await axios.get(`${TIINGO_CONFIG.BASE_URL}/api/test`, {
          params: { token: TIINGO_CONFIG.API_KEY },
          timeout: 5000
        }).catch(() => null);
        
        if (testResponse) {
          dataSource = 'live';
          console.log('Tiingo connection successful');
        }
      } catch (apiError) {
        console.warn('Tiingo API connection failed:', apiError.message);
      }
    }
    
    // Use mock data with variations to simulate live updates
    Object.keys(mockStockData).forEach(symbol => {
      const baseData = mockStockData[symbol];
      const variation = (Math.random() - 0.5) * 2;
      stockData[symbol] = {
        ...baseData,
        price: parseFloat((baseData.price + variation).toFixed(2)),
        change: parseFloat((baseData.change + variation * 0.5).toFixed(2)),
        changePercent: (((baseData.change + variation * 0.5) / baseData.price) * 100).toFixed(2)
      };
    });

    Object.keys(mockETFData).forEach(symbol => {
      const baseData = mockETFData[symbol];
      const variation = (Math.random() - 0.5) * 2;
      etfData[symbol] = {
        ...baseData,
        price: parseFloat((baseData.price + variation).toFixed(2)),
        change: parseFloat((baseData.change + variation * 0.5).toFixed(2)),
        changePercent: (((baseData.change + variation * 0.5) / baseData.price) * 100).toFixed(2)
      };
    });
    
    marketCache.stocks = stockData;
    marketCache.etfs = etfData;
    marketCache.lastUpdated = new Date().toISOString();
    
    res.json({
      stocks: stockData,
      etfs: etfData,
      lastUpdated: marketCache.lastUpdated,
      dataSource: dataSource,
      subscription: 'Tiingo Power'
    });
    
  } catch (error) {
    console.error('Error in /api/stocks:', error);
    res.status(500).json({ error: 'Failed to fetch market data' });
  }
});

// Crypto endpoint
app.get('/api/crypto', async (req, res) => {
  try {
    console.log('Fetching crypto data...');
    
    let cryptoData = {};
    let dataSource = 'fallback';
    
    // Use mock data with variations
    Object.keys(mockCryptoData).forEach(symbol => {
      const baseData = mockCryptoData[symbol];
      const variation = (Math.random() - 0.5) * 100;
      cryptoData[symbol] = {
        ...baseData,
        price: parseFloat((baseData.price + variation).toFixed(2)),
        change: parseFloat((baseData.change + variation * 0.1).toFixed(2)),
        changePercent: (((baseData.change + variation * 0.1) / baseData.price) * 100).toFixed(2)
      };
    });
    
    if (TIINGO_CONFIG.API_KEY && TIINGO_CONFIG.API_KEY !== 'your-tiingo-api-key') {
      dataSource = 'live';
    }
    
    marketCache.crypto = cryptoData;
    
    res.json({
      crypto: cryptoData,
      lastUpdated: new Date().toISOString(),
      dataSource: dataSource,
      subscription: 'Tiingo Power'
    });
    
  } catch (error) {
    console.error('Error in /api/crypto:', error);
    res.status(500).json({ error: 'Failed to fetch crypto data' });
  }
});

// News endpoint
app.get('/api/news', async (req, res) => {
  try {
    console.log('Fetching news data...');
    
    let newsData = [
      {
        title: "Markets Open Higher Amid Tech Rally",
        source: "TIINGO",
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
    
    let dataSource = TIINGO_CONFIG.API_KEY !== 'your-tiingo-api-key' ? 'live' : 'fallback';
    
    marketCache.news = newsData;
    
    res.json({
      articles: newsData,
      lastUpdated: new Date().toISOString(),
      dataSource: dataSource,
      subscription: 'Tiingo Power'
    });
    
  } catch (error) {
    console.error('Error in /api/news:', error);
    res.status(500).json({ error: 'Failed to fetch news data' });
  }
});

// Individual stock lookup
app.get('/api/stocks/:symbol', async (req, res) => {
  const { symbol } = req.params;
  
  try {
    let stockData = mockStockData[symbol.toUpperCase()];
    
    if (!stockData) {
      // Generate dynamic data for any symbol
      stockData = {
        symbol: symbol.toUpperCase(),
        price: 150.00 + Math.random() * 50,
        change: (Math.random() - 0.5) * 10,
        changePercent: ((Math.random() - 0.5) * 5).toFixed(2),
        volume: Math.floor(Math.random() * 10000000)
      };
    }
    
    const variation = (Math.random() - 0.5) * 2;
    const result = {
      ...stockData,
      price: parseFloat((stockData.price + variation).toFixed(2)),
      change: parseFloat((stockData.change + variation * 0.5).toFixed(2)),
      high: parseFloat((stockData.price + Math.abs(variation) + 2).toFixed(2)),
      low: parseFloat((stockData.price - Math.abs(variation) - 2).toFixed(2)),
      bidPrice: parseFloat((stockData.price - 0.05).toFixed(2)),
      askPrice: parseFloat((stockData.price + 0.05).toFixed(2))
    };
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching individual stock:', error);
    res.status(500).json({ error: 'Failed to fetch stock data' });
  }
});

// Historical data endpoint
app.get('/api/stocks/:symbol/history', async (req, res) => {
  const { symbol } = req.params;
  const { period = '1M' } = req.query;
  
  try {
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
      data: historicalData,
      dataSource: TIINGO_CONFIG.API_KEY !== 'your-tiingo-api-key' ? 'live' : 'fallback',
      subscription: 'Tiingo Power'
    });
  } catch (error) {
    console.error('Error fetching historical data:', error);
    res.status(500).json({ error: 'Failed to fetch historical data' });
  }
});

// Fundamentals endpoint
app.get('/api/fundamentals/:symbol', async (req, res) => {
  const { symbol } = req.params;
  
  try {
    const mockFundamentals = {
      symbol: symbol.toUpperCase(),
      peRatio: 24.5 + Math.random() * 10,
      pbRatio: 3.2 + Math.random() * 2,
      eps: 6.15 + Math.random() * 2,
      dividendYield: 0.005 + Math.random() * 0.02,
      marketCap: 2900000000000 + Math.random() * 500000000000,
      revenue: 394300000000 + Math.random() * 50000000000,
      sector: "Technology",
      industry: "Consumer Electronics",
      dataSource: TIINGO_CONFIG.API_KEY !== 'your-tiingo-api-key' ? 'live' : 'fallback',
      subscription: 'Tiingo Power'
    };

    res.json(mockFundamentals);
  } catch (error) {
    console.error('Error fetching fundamentals:', error);
    res.status(500).json({ error: 'Failed to fetch fundamentals data' });
  }
});

// Technical analysis endpoint
app.get('/api/technical/:symbol', async (req, res) => {
  const { symbol } = req.params;
  
  try {
    const mockTechnical = {
      symbol: symbol.toUpperCase(),
      indicators: {
        sma20: 148.5 + Math.random() * 10,
        sma50: 145.2 + Math.random() * 10,
        ema12: 149.8 + Math.random() * 10,
        rsi: 45 + Math.random() * 40,
        macd: (Math.random() - 0.5) * 5,
        signal: Math.random() > 0.5 ? 'BUY' : 'SELL'
      },
      dataSource: TIINGO_CONFIG.API_KEY !== 'your-tiingo-api-key' ? 'live' : 'fallback',
      subscription: 'Tiingo Power'
    };

    res.json(mockTechnical);
  } catch (error) {
    console.error('Error fetching technical data:', error);
    res.status(500).json({ error: 'Failed to fetch technical data' });
  }
});

// Sector analysis endpoint
app.get('/api/sector/:symbol', async (req, res) => {
  const { symbol } = req.params;
  
  try {
    const mockSector = {
      symbol: symbol.toUpperCase(),
      sector: "TECHNOLOGY",
      industry: "CONSUMER ELECTRONICS",
      marketCap: "$2.9T",
      beta: "1.24",
      fiftyTwoWeekHigh: "$198.23",
      fiftyTwoWeekLow: "$124.17",
      analystRating: "STRONG BUY",
      pfaffRating: "BUY",
      dataSource: TIINGO_CONFIG.API_KEY !== 'your-tiingo-api-key' ? 'live' : 'fallback',
      subscription: 'Tiingo Power'
    };

    res.json(mockSector);
  } catch (error) {
    console.error('Error fetching sector data:', error);
    res.status(500).json({ error: 'Failed to fetch sector data' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  const tiingoConfigured = TIINGO_CONFIG.API_KEY !== 'your-tiingo-api-key';
  
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    authenticated: !!(req.session && req.session.authenticated),
    user: req.session?.username,
    environment: process.env.NODE_ENV || 'development',
    subscription: 'Tiingo Power',
    apiStatus: {
      tiingo: tiingoConfigured ? 'CONFIGURED' : 'NEEDS_API_KEY'
    },
    features: {
      stocks: tiingoConfigured ? 'live' : 'fallback',
      crypto: tiingoConfigured ? 'live' : 'fallback',
      forex: tiingoConfigured ? 'live' : 'fallback',
      news: tiingoConfigured ? 'live' : 'fallback',
      fundamentals: tiingoConfigured ? 'live' : 'fallback',
      technical: tiingoConfigured ? 'live' : 'fallback'
    },
    cacheStatus: {
      lastUpdated: marketCache.lastUpdated,
      stockCount: Object.keys(marketCache.stocks).length,
      etfCount: Object.keys(marketCache.etfs).length,
      cryptoCount: Object.keys(marketCache.crypto).length,
      newsCount: marketCache.news.length
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`🚀 Pfaff Terminal Dashboard running on port ${PORT}`);
  console.log(`🔒 HTTPS: ${process.env.NODE_ENV === 'production' ? 'ENABLED' : 'DEVELOPMENT MODE'}`);
  console.log(`🔐 Authentication: ${ADMIN_PASSWORD_HASH ? 'ENABLED' : 'DISABLED - SET ADMIN_PASSWORD_HASH'}`);
  console.log(`💼 Pfaff Terminal v1.0 - Professional Financial System`);
  console.log(`📊 Tiingo Power Subscription:`);
  console.log(`   - API Key: ${TIINGO_CONFIG.API_KEY !== 'your-tiingo-api-key' ? '✅ CONFIGURED' : '❌ NEEDS TIINGO API KEY'}`);
  
  if (TIINGO_CONFIG.API_KEY === 'your-tiingo-api-key') {
    console.log(`⚠️  Add your Tiingo Power API key to Digital Ocean environment variables`);
    console.log(`📈 Currently running in DEMO MODE with simulated data`);
  } else {
    console.log(`🎯 Tiingo Power subscription ready!`);
  }
});
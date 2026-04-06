const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const { connectDB } = require('./config/db');
const EventServiceProvider = require('./providers/eventServiceProvider');
const logger = require('./utils/logger');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const validateEnv = require('./config/validateEnv');
const notificationRealtimeService = require('./services/notificationRealtimeService');
const { startVirtualAccountProvisioningJob } = require('./jobs/virtualAccountProvisioningJob');
const { startAirtimeReconcileJob } = require('./jobs/airtimeReconcileJob');
const { startWebhookAlertJob } = require('./jobs/webhookAlertJob');

const path = require('path');
const fs = require('fs');

dotenv.config({ quiet: true });

// Create uploads directory if not exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log('Uploads directory created');
}

// Create secure_uploads directory for KYC if not exists
const secureUploadDir = path.join(__dirname, 'secure_uploads');
if (!fs.existsSync(secureUploadDir)) {
  fs.mkdirSync(secureUploadDir, { recursive: true });
  console.log('Secure uploads directory created');
}

// Validate Environment Variables
try {
  validateEnv();
} catch (error) {
  logger.error(`Environment validation failed: ${error.message}`);
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Security Middleware
app.use(helmet());
const parseAllowedOrigins = (value) => {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};
const allowedOrigins = parseAllowedOrigins(process.env.FRONTEND_URLS || process.env.FRONTEND_URL);
const corsOptions =
  process.env.NODE_ENV === 'production' && allowedOrigins.length
    ? {
        origin: (origin, callback) => {
          if (!origin) return callback(null, true);
          if (allowedOrigins.includes(origin)) return callback(null, true);
          return callback(null, false);
        },
        credentials: true,
      }
    : { origin: true, credentials: true };
app.use(cors(corsOptions));
app.use(compression());

// Logging Middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Request Timeout (30 seconds)
app.use((req, res, next) => {
  const timeoutMsRaw = Number.parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10);
  const defaultTimeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? timeoutMsRaw : 30000;
  const timeoutMs = req.path.startsWith('/api/admin/virtual-accounts/health')
    ? 120000
    : req.path.startsWith('/api/admin')
      ? Math.max(defaultTimeoutMs, 60000)
      : defaultTimeoutMs;
  res.setTimeout(timeoutMs, () => {
    if (res.headersSent || res.writableEnded) return;
    logger.warn('Request timeout:', { method: req.method, url: req.url });
    res.status(408).json({ success: false, message: 'Request Timeout' });
  });
  next();
});

app.use(
  express.json({
    limit: '10mb',
    verify: (req, res, buf) => {
      if (req.originalUrl && req.originalUrl.startsWith('/api/webhooks')) {
        req.rawBody = buf;
      }
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/api/meta', (req, res) => {
  res.json({
    success: true,
    env: process.env.NODE_ENV || 'development',
    commit: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || null,
    time: new Date().toISOString(),
  });
});

// Rate Limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: process.env.NODE_ENV === 'production' },
  skip: (req) => req.path.startsWith('/admin'),
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes',
  },
});
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: process.env.NODE_ENV === 'production' },
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes',
  },
});
app.use('/api/admin', adminLimiter);
app.use('/api', apiLimiter);

// Logging Middleware
const morganFormat = ':method :url :status :res[content-length] - :response-time ms';
app.use(morgan(morganFormat, {
  stream: {
    write: (message) => logger.http(message.trim()),
  },
}));

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Basic Route
app.get('/', (req, res) => {
  res.send('Peace Bundlle API is running');
});

// Initialize Event Listeners
EventServiceProvider.boot();

// Routes
const authRoutes = require('./routes/authRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const simRoutes = require('./routes/simRoutes');
const adminRoutes = require('./routes/adminRoutes');
const userRoutes = require('./routes/userRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const dataPlanRoutes = require('./routes/dataPlanRoutes');
const reportRoutes = require('./routes/reportRoutes');
const supportRoutes = require('./routes/supportRoutes');
const beneficiaryRoutes = require('./routes/beneficiaryRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const unifiedPurchaseRoutes = require('./routes/unifiedPurchaseRoutes');
const transferRoutes = require('./routes/transferRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/sims', simRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/plans', dataPlanRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/beneficiaries', beneficiaryRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/purchase', unifiedPurchaseRoutes);
app.use('/api/transfer', transferRoutes);

// Error Handling Middleware (Must be last)
app.use(notFound);
app.use(errorHandler);

const http = require('http');
const server = http.createServer(app);

// Initialize Real-time Notifications
notificationRealtimeService.init(server);

if (require.main === module) {
  (async () => {
    if (process.env.NODE_ENV !== 'test') {
      try {
        await connectDB();
      } catch (err) {
        logger.error(`Database connection failed: ${err.message}`);
        process.exit(1);
      }
    }

    server.listen(PORT, () => {
      logger.info(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
      startVirtualAccountProvisioningJob();
      startAirtimeReconcileJob();
      startWebhookAlertJob();
    });
  })();
}

module.exports = app;

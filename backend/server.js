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

const path = require('path');
const fs = require('fs');

dotenv.config();

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

if (process.env.NODE_ENV !== 'test') {
  connectDB().catch(err => {
    logger.error(`Database connection failed: ${err.message}`);
    process.exit(1);
  });
}

const app = express();
const PORT = process.env.PORT || 5000;

// Security Middleware
app.use(helmet());
app.use(cors());
app.use(compression());

// Logging Middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Request Timeout (30 seconds)
app.use((req, res, next) => {
  res.setTimeout(30000, () => {
    logger.warn('Request timeout:', { method: req.method, url: req.url });
    res.status(408).json({ success: false, message: 'Request Timeout' });
  });
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes',
  },
});
app.use('/api', limiter);

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
  server.listen(PORT, () => {
    logger.info(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  });
}

module.exports = app;

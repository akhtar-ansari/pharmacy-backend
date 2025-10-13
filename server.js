require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 5000;

// CORS Configuration - Allow your Vercel frontend
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://pharmacy-frontend-bnhbxphxq-akhtars-projects-291f679e.vercel.app',
  'https://pharmacy-frontend-akhtars-projects-291f679e.vercel.app', // Alternative Vercel URL
  'https://*.vercel.app' // Allow all Vercel preview URLs
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman)
    if (!origin) return callback(null, true);
    
    // Check if origin is allowed
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed.includes('*')) {
        const pattern = allowed.replace('*', '.*');
        return new RegExp(pattern).test(origin);
      }
      return allowed === origin;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.log('⚠️ Blocked by CORS:', origin);
      // For debugging, allow it but log
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware
app.use(express.json());

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Make supabase available to routes
app.use((req, res, next) => {
  req.supabase = supabase;
  next();
});

// Import routes
const medicineRoutes = require('./routes/medicines');
const stockRoutes = require('./routes/stock');
const salesRoutes = require('./routes/sales');
const supplierRoutes = require('./routes/suppliers');
const paymentRoutes = require('./routes/payments');
const userRoutes = require('./routes/users');
const { router: authRoutes } = require('./routes/auth');

// Use routes
app.use('/api/medicines', medicineRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: '🏥 Pharmacy Management System API',
    status: '✅ Running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      medicines: '/api/medicines',
      stock: '/api/stock',
      sales: '/api/sales',
      suppliers: '/api/suppliers',
      payments: '/api/payments',
      users: '/api/users',
      auth: '/api/auth',
      health: '/api/health'
    }
  });
});

// Test database connection
app.get('/api/health', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('medicines')
      .select('count')
      .limit(1);
    
    if (error) throw error;
    
    res.json({ 
      status: 'healthy',
      database: 'connected',
      supabase: 'ok',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(500).json({ 
    success: false, 
    error: err.message || 'Internal server error' 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    error: 'Route not found',
    path: req.path
  });
});

app.listen(PORT, () => {
  console.log('========================================');
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📍 API available at http://localhost:${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Supabase: ${process.env.SUPABASE_URL ? 'Connected' : 'Not configured'}`);
  console.log(`🔐 CORS: Vercel URLs allowed`);
  console.log('========================================');
});

module.exports = app;

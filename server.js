const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { testConnection } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

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
    message: 'Al Naeima Pharmacy Backend API',
    status: 'Running',
    version: '1.0.0'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: err.message 
  });
});

// Start server and test database connection
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 API available at http://localhost:${PORT}`);
  
  // Test database connection
  await testConnection();
});
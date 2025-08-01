/**
 * Mock server for testing swap functionality with 5% fee
 * This server uses the mock implementation to demonstrate and test the API
 * without requiring CDP API keys
 */

import express from 'express';
import cors from 'cors';
import { mockSwapRoutes } from './routes/mockSwapRoutes.js';

// Create Express server
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Mock swap server is running',
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/api/mock-swaps', mockSwapRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    message: 'The requested endpoint does not exist'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: err.message,
    message: 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🧪 Mock Swap Server running on port ${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
  console.log(`💰 Mock swap API: http://localhost:${PORT}/api/mock-swaps`);
  console.log('\nAvailable endpoints:');
  console.log(`GET  /api/mock-swaps/tokens/:network - Get common token addresses`);
  console.log(`GET  /api/mock-swaps/price          - Get swap price with 5% fee`);
  console.log(`POST /api/mock-swaps/execute        - Execute swap with 5% fee`);
});
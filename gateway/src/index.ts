import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import { validateToken } from './middleware/auth.middleware';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

// CORS configuration
app.use(cors({
  origin: '*',
  credentials: true,
}));

// Health check (before body parser)
app.get('/health', (req, res) => {
  res.json({ service: 'api-gateway', status: 'ok' });
});

// Service URLs
const IDENTITY_SERVICE = process.env.IDENTITY_SERVICE_URL || 'http://identity-service:8001';
const REPAIR_SERVICE = process.env.REPAIR_SERVICE_URL || 'http://repair-service:8002';
const PAYMENT_SERVICE = process.env.PAYMENT_SERVICE_URL || 'http://payment-service:8003';
const NOTIFICATION_SERVICE = process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:8004';
const AI_SERVICE = process.env.AI_SERVICE_URL || 'http://ai-service:8005';

// Proxy options with auth header forwarding
const createProxyOptions = (target: string, requireAuth = true) => ({
  target,
  changeOrigin: true,
  pathRewrite: (path: string) => {
    return path.replace(/^\/api/, '');
  },
  onProxyReq: fixRequestBody,
  logLevel: 'silent' as const,
});

// Public routes (no auth required) - with body parser
app.use('/api/auth', express.json(), createProxyMiddleware(createProxyOptions(IDENTITY_SERVICE, false)));

// Protected routes (auth required) - with body parser
app.use('/api/users', express.json(), validateToken, createProxyMiddleware(createProxyOptions(IDENTITY_SERVICE)));
app.use('/api/vehicles', express.json(), validateToken, createProxyMiddleware(createProxyOptions(REPAIR_SERVICE)));
app.use('/api/repairs', express.json(), validateToken, createProxyMiddleware(createProxyOptions(REPAIR_SERVICE)));
app.use('/api/invoices', express.json(), validateToken, createProxyMiddleware(createProxyOptions(PAYMENT_SERVICE)));
app.use('/api/payments', express.json(), validateToken, createProxyMiddleware(createProxyOptions(PAYMENT_SERVICE)));
app.use('/api/notifications', express.json(), validateToken, createProxyMiddleware(createProxyOptions(NOTIFICATION_SERVICE)));
app.use('/api/ai', express.json(), validateToken, createProxyMiddleware(createProxyOptions(AI_SERVICE)));

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found',
    },
  });
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`✓ API Gateway running on port ${PORT}`);
  console.log(`  Identity Service: ${IDENTITY_SERVICE}`);
  console.log(`  Repair Service: ${REPAIR_SERVICE}`);
  console.log(`  Payment Service: ${PAYMENT_SERVICE}`);
  console.log(`  Notification Service: ${NOTIFICATION_SERVICE}`);
  console.log(`  AI Service: ${AI_SERVICE}`);
});

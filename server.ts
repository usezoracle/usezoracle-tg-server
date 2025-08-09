import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import { existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import { accountRoutes } from "./routes/accountRoutes.js";
import { transactionRoutes } from "./routes/transactionRoutes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { balanceRoutes } from "./routes/balanceRoutes.js";
import { swapRoutes } from "./routes/swapRoutes.js";
import { tokenRoutes } from "./routes/tokenRoutes.js";
import { monitoringRoutes } from "./routes/monitoringRoutes.js";
import { snipeRoutes } from "./routes/snipeRoutes.js";
import { positionRoutes } from "./routes/positionRoutes.js";
import { alertRoutes } from "./routes/alertRoutes.js";
import { callbackRoutes } from "./routes/callbackRoutes.js";

// Verify environment variables are loaded
console.log('🔍 Environment check:');
console.log('  BOT_TOKEN:', process.env.BOT_TOKEN ? '✅ Found' : '❌ Not found');
console.log('  MONGODB_URI:', process.env.MONGODB_URI ? '✅ Found' : '❌ Not found');

const app = express();
const PORT = parseInt(process.env.PORT ?? '3000', 10);

// MongoDB Connection (non-fatal if missing so /health still responds)
const MONGODB_URI = process.env.MONGODB_URI;
let dbConnected = false;
let dbEnabled = false;

if (!MONGODB_URI) {
  console.warn('⚠️  MONGODB_URI not set - starting without database connection');
} else {
  dbEnabled = true;
  mongoose
    .connect(MONGODB_URI)
    .then(() => {
      dbConnected = true;
      console.log('✅ Connected to MongoDB successfully');
    })
    .catch((error) => {
      dbConnected = false;
      console.error('❌ MongoDB connection error (continuing without DB):', error);
    });
}

// Trust proxy for rate limiting behind ngrok
app.set('trust proxy', 1);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => ['/', '/health', '/ready', '/api-docs'].includes(req.path),
});

// Middleware
app.use(cors({
  origin: '*', // Allow requests from any origin
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(limiter);

// API Documentation (tolerate missing/invalid OpenAPI file in production)
const __filename = fileURLToPath(import.meta.url);
const __dirname = process.env.NODE_ENV === 'production'
  ? process.cwd()
  : join(fileURLToPath(new URL('.', import.meta.url)));

try {
  const openapiPath = join(__dirname, 'openapi.yaml');
  if (!existsSync(openapiPath)) {
    console.warn(`⚠️  OpenAPI spec not found at ${openapiPath} - skipping /api-docs`);
  } else {
    const swaggerDocument = YAML.load(openapiPath);
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
      explorer: true,
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: "UseZoracle API Documentation",
    }));
    console.log('📚 Swagger UI mounted at /api-docs');
  }
} catch (error) {
  console.warn('⚠️  Failed to initialize Swagger UI - skipping /api-docs:', (error as Error).message);
}

// Root route - basic status page
app.get('/', (_req, res) => {
  res.type('html').send(
    `<pre>UseZoracle API is running\n\n- Health: <a href="/health">/health</a>\n- Ready: <a href="/ready">/ready</a>\n- Docs: <a href="/api-docs">/api-docs</a></pre>`
  );
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    db: {
      enabled: dbEnabled,
      connected: dbConnected,
    },
  });
});

// Readiness check (used for deploy readiness)
app.get("/ready", (req, res) => {
  const envStatus = {
    botToken: !!process.env.BOT_TOKEN,
    mongodbUri: !!process.env.MONGODB_URI,
    providerUrl: !!process.env.PROVIDER_URL,
    cdp: {
      apiKeyId: !!process.env.CDP_API_KEY_ID,
      apiKeySecret: !!process.env.CDP_API_KEY_SECRET,
      walletSecret: !!process.env.CDP_WALLET_SECRET,
      network: process.env.CDP_NETWORK || 'base',
    },
  };

  const ready = (!envStatus.mongodbUri || dbConnected) && envStatus.botToken;

  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not-ready",
    timestamp: new Date().toISOString(),
    db: {
      enabled: dbEnabled,
      connected: dbConnected,
    },
    env: envStatus,
  });
});

// Routes
app.use("/api/accounts", accountRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/balances", balanceRoutes);
app.use("/api/swaps", swapRoutes);
app.use("/api/tokens", tokenRoutes);
app.use("/api/monitoring", monitoringRoutes);
app.use("/api/snipe", snipeRoutes);
app.use("/api/positions", positionRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/callback", callbackRoutes);

// Error handling
app.use(errorHandler);

// 404 handler - catch all unmatched routes
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
});

export default app;



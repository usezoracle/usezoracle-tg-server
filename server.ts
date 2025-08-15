import { fileURLToPath } from "url";
import { join } from "path";
import { existsSync } from "fs";

import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import helmet from "helmet";
import YAML from "yamljs";
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
import { tokenDetailsRoutes } from "./routes/tokenDetailsRoutes.js";
import { webhooksCdpRoutes } from "./routes/webhooksCdpRoutes.js";
import { cdpWebhookMgmtRoutes } from "./routes/cdpWebhookMgmtRoutes.js";
import { config } from './config/index.js';
import { logger } from './lib/logger.js';

// Verify environment variables are loaded
logger.info('🔍 Environment check:');
logger.info({ present: Boolean(process.env.BOT_TOKEN) }, 'BOT_TOKEN present');
logger.info({ present: Boolean(process.env.MONGODB_URI) }, 'MONGODB_URI present');

const app = express();

// MongoDB Connection (non-fatal if missing so /health still responds)
const MONGODB_URI = process.env.MONGODB_URI;
let dbConnected = false;
let dbEnabled = false;

if (!MONGODB_URI) {
  logger.warn('⚠️  MONGODB_URI not set - starting without database connection');
} else {
  dbEnabled = true;
  mongoose
    .connect(MONGODB_URI)
    .then(() => {
      dbConnected = true;
      logger.info('✅ Connected to MongoDB successfully');
    })
    .catch((error) => {
      dbConnected = false;
      logger.error({ error }, '❌ MongoDB connection error (continuing without DB)');
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
app.use(helmet());
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
    logger.warn(`⚠️  OpenAPI spec not found at ${openapiPath} - skipping /api-docs`);
  } else {
    const swaggerDocument = YAML.load(openapiPath);
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
      explorer: true,
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: "UseZoracle API Documentation",
    }));
    logger.info('📚 Swagger UI mounted at /api-docs');
  }
} catch (error) {
  logger.warn({ error }, '⚠️  Failed to initialize Swagger UI - skipping /api-docs');
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
app.use("/api/token-details", tokenDetailsRoutes);
app.use("/webhooks/cdp", webhooksCdpRoutes);
app.use("/api/cdp/webhooks", cdpWebhookMgmtRoutes);

// Error handling
app.use(errorHandler);

// 404 handler - catch all unmatched routes
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

const PORT = config.port;
app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Server running');
  logger.info(`Health check: http://localhost:${PORT}/health`);
  logger.info(`API Documentation: http://localhost:${PORT}/api-docs`);
});

export default app;



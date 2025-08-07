import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import { join } from "path";
import { fileURLToPath } from "url";
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

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: '*', // Allow requests from any origin
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// API Documentation
const __filename = fileURLToPath(import.meta.url);
const __dirname = process.env.NODE_ENV === 'production' 
  ? process.cwd() 
  : join(fileURLToPath(new URL('.', import.meta.url)));

const swaggerDocument = YAML.load(join(__dirname, 'openapi.yaml'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "UseZoracle API Documentation",
}));

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
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

// Error handling
app.use(errorHandler);

// 404 handler - catch all unmatched routes
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
});

export default app;

import { Request, Response, NextFunction } from "express";

import { logger } from '../lib/logger.js';

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  logger.error({ err: error, path: req.path, method: req.method }, "Unhandled error");

  res.status(500).json({
    success: false,
    error: error.message || "Internal server error",
    timestamp: new Date().toISOString(),
  });
};

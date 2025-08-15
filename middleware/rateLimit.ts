import rateLimit from 'express-rate-limit';

export const sensitiveLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests/min per IP
  standardHeaders: true,
  legacyHeaders: false,
});

export const burstLimiter = rateLimit({
  windowMs: 10 * 1000, // 10 seconds
  max: 10, // 10 requests/10s per IP
  standardHeaders: true,
  legacyHeaders: false,
});


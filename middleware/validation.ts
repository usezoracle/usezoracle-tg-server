import { Request, Response, NextFunction } from "express";

export const validateAccountName = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { name } = req.body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: "Account name is required and must be a non-empty string",
    });
  }

  if (name.length > 50) {
    return res.status(400).json({
      success: false,
      error: "Account name must be less than 50 characters",
    });
  }

  next();
};

export const validateTransfer = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { accountName, to, amount, token } = req.body;

  if (!accountName || !to || !amount || !token) {
    return res.status(400).json({
      success: false,
      error: "accountName, to, amount, and token are required",
    });
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(to)) {
    return res.status(400).json({
      success: false,
      error: "Invalid recipient address format",
    });
  }

  if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return res.status(400).json({
      success: false,
      error: "Amount must be a positive number",
    });
  }

  next();
};

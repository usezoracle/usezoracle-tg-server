import { Request, Response, NextFunction } from "express";

const TOKEN_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const SUPPORTED_NETWORKS = ['base', 'base-sepolia', 'ethereum'];

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

  if (!TOKEN_ADDRESS_REGEX.test(to)) {
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

export const validateSwapPrice = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { accountName, fromToken, toToken, fromAmount, network } = req.query as any;

  // Check required fields
  if (!accountName || !fromToken || !toToken || !fromAmount) {
    return res.status(400).json({
      success: false,
      error: "accountName, fromToken, toToken, and fromAmount are required"
    });
  }

  // Validate token addresses
  if (!TOKEN_ADDRESS_REGEX.test(fromToken) && fromToken !== '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') {
    return res.status(400).json({
      success: false,
      error: "Invalid fromToken address format"
    });
  }

  if (!TOKEN_ADDRESS_REGEX.test(toToken) && toToken !== '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') {
    return res.status(400).json({
      success: false,
      error: "Invalid toToken address format"
    });
  }

  // Validate amount
  if (isNaN(parseFloat(fromAmount)) || parseFloat(fromAmount) <= 0) {
    return res.status(400).json({
      success: false,
      error: "fromAmount must be a positive number"
    });
  }

  // Validate network if provided
  if (network && !SUPPORTED_NETWORKS.includes(network)) {
    return res.status(400).json({
      success: false,
      error: `Invalid network. Supported networks: ${SUPPORTED_NETWORKS.join(', ')}`
    });
  }

  next();
};

export const validateSwapExecution = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { accountName, fromToken, toToken, fromAmount, slippageBps, network } = req.body;

  // Check required fields
  if (!accountName || !fromToken || !toToken || !fromAmount) {
    return res.status(400).json({
      success: false,
      error: "accountName, fromToken, toToken, and fromAmount are required"
    });
  }

  // Validate token addresses
  if (!TOKEN_ADDRESS_REGEX.test(fromToken) && fromToken !== '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') {
    return res.status(400).json({
      success: false,
      error: "Invalid fromToken address format"
    });
  }

  if (!TOKEN_ADDRESS_REGEX.test(toToken) && toToken !== '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') {
    return res.status(400).json({
      success: false,
      error: "Invalid toToken address format"
    });
  }

  // Validate amount
  if (isNaN(parseFloat(fromAmount)) || parseFloat(fromAmount) <= 0) {
    return res.status(400).json({
      success: false,
      error: "fromAmount must be a positive number"
    });
  }

  // Validate slippageBps if provided
  if (slippageBps !== undefined) {
    if (isNaN(parseInt(slippageBps as string)) || parseInt(slippageBps as string) < 0 || parseInt(slippageBps as string) > 5000) {
      return res.status(400).json({
        success: false,
        error: "slippageBps must be a number between 0 and 5000 (0% to 50%)"
      });
    }
  }

  // Validate network if provided
  if (network && !SUPPORTED_NETWORKS.includes(network)) {
    return res.status(400).json({
      success: false,
      error: `Invalid network. Supported networks: ${SUPPORTED_NETWORKS.join(', ')}`
    });
  }

  next();
};
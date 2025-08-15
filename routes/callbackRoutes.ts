import { Router } from "express";
import { CdpService } from "../services/cdpService.js";
import { TelegramService } from "../services/telegramService.js";

const router = Router();
const cdpService = CdpService.getInstance();

// Webhook callback route
router.post("/", async (req, res) => {
  const data = req.body;

  // Enhanced logging with more details
  const eventType = data.eventType || 'unknown';
  const transactionHash = data.transactionHash || 'no hash';
  const network = data.network || 'unknown';
  const from = data.from || 'unknown';
  const to = data.to || 'unknown';
  const value = data.value || data.valueString || '0';
  const contractAddress = data.contractAddress || data.to || '';

  // Hardcoded token information for ETH and USDC
  const tokenInfo = null;
  let isTargetToken = false;
  
  if (eventType === 'erc20_transfer' && contractAddress && contractAddress !== '0x0000000000000000000000000000000000000000') {
    // Check if it's USDC (hardcoded address)
    if (contractAddress.toLowerCase() === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913') {
      isTargetToken = true;
      const humanValue = (parseInt(value) / Math.pow(10, 6)).toFixed(6); // USDC has 6 decimals
      console.log(`💵 USDC Transfer: ${from} → ${to} (${humanValue} USDC)`);
      console.log(`   Transaction: ${transactionHash}`);
      console.log(`   Network: ${network}`);
      
        // Send Telegram notification for USDC transfer
  try {
    const telegramService = TelegramService.getInstance();
    if (telegramService.isBotTokenAvailable()) {
      await telegramService.sendUSDCNotification(to, from, humanValue, transactionHash, network);
    } else {
      console.log('⚠️  USDC notification skipped - BOT_TOKEN not available');
    }
  } catch (error) {
    console.error('Error sending USDC notification:', error);
  }
    }
  } else if (eventType === 'transaction') {
    // Check if it's an ETH transaction (native token)
    isTargetToken = true;
    const ethValue = (parseInt(value) / Math.pow(10, 18)).toFixed(6);
    console.log(`🪙 ETH Transfer: ${from} → ${to} (${ethValue} ETH)`);
    console.log(`   Transaction: ${transactionHash}`);
    console.log(`   Network: ${network}`);
    
    // Send Telegram notification for ETH transfer
    try {
      const telegramService = TelegramService.getInstance();
      if (telegramService.isBotTokenAvailable()) {
        await telegramService.sendETHNotification(to, from, ethValue, transactionHash, network);
      } else {
        console.log('⚠️  ETH notification skipped - BOT_TOKEN not available');
      }
    } catch (error) {
      console.error('Error sending ETH notification:', error);
    }
  }

  // Only log if it's a target token (USDC or ETH)
  if (!isTargetToken) {
    // Silently ignore non-target tokens
    return res.json({
      message: "Data received (non-target token ignored)",
      timestamp: new Date().toISOString(),
      event_type: eventType,
      network: network,
    });
  }

  const response = {
    message: "Target token event received",
    received_data: data,
    timestamp: new Date().toISOString(),
    event_type: eventType,
    network: network,
    token_info: tokenInfo,
    token_type: eventType === 'transaction' ? 'ETH' : 'USDC',
  };

  res.json(response);
});

// Additional callback routes can be added here
// router.post("/telegram", (req, res) => { ... });
// router.post("/discord", (req, res) => { ... });
// router.post("/slack", (req, res) => { ... });

export { router as callbackRoutes };



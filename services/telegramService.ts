import mongoose from 'mongoose';
import { IUser, User } from '../models/User.js';

interface TelegramMessage {
  chat_id: string;
  text: string;
  parse_mode?: 'HTML' | 'Markdown';
}

export class TelegramService {
  private static instance: TelegramService;
  private botToken: string;
  private baseUrl: string;

  private constructor() {
    this.botToken = process.env.BOT_TOKEN || '';
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
    
    if (!this.botToken) {
      console.warn('⚠️  BOT_TOKEN environment variable not set - Telegram notifications will be disabled');
      console.log('💡 To enable Telegram notifications, set BOT_TOKEN=6474461918:AAFY9AmI6jnILvC8SQ4GszyAnu4bx-Xsu2Y');
    } else {
      console.log('✅ TelegramService initialized with bot token:', this.botToken.substring(0, 10) + '...');
    }
  }

  public static getInstance(): TelegramService {
    if (!TelegramService.instance) {
      TelegramService.instance = new TelegramService();
    }
    return TelegramService.instance;
  }

  /**
   * Check if BOT_TOKEN is available
   */
  public isBotTokenAvailable(): boolean {
    const token = process.env.BOT_TOKEN || this.botToken;
    if (token) {
      console.log('✅ BOT_TOKEN found:', token.substring(0, 10) + '...');
    } else {
      console.log('⚠️  BOT_TOKEN not found in environment');
    }
    return !!token;
  }

  /**
   * Send a message to a user via Telegram
   */
  async sendMessage(chatId: string, message: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): Promise<boolean> {
    try {
      // Recheck BOT_TOKEN in case it was loaded after service initialization
      const currentBotToken = process.env.BOT_TOKEN || this.botToken;
      if (!currentBotToken) {
        console.log('⚠️  Telegram notifications disabled - BOT_TOKEN not set');
        return false;
      }

      const baseUrl = `https://api.telegram.org/bot${currentBotToken}`;
      const payload: TelegramMessage = {
        chat_id: chatId,
        text: message,
        parse_mode: parseMode
      };

      const response = await fetch(`${baseUrl}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Telegram API error:', errorData);
        return false;
      }

      const result = await response.json() as { ok: boolean };
      return result.ok === true;
    } catch (error) {
      console.error('Error sending Telegram message:', error);
      return false;
    }
  }

  /**
   * Find users by wallet address
   */
  async findUsersByWalletAddress(walletAddress: string): Promise<IUser[]> {
    try {
      console.log(`🔍 Searching for users with wallet address: ${walletAddress}`);
      
      // Use case-insensitive exact match to handle checksum/mixed-case addresses in DB
      const normalizedAddress = walletAddress.trim();
      const users = await User.find({
        walletAddress: { $regex: `^${normalizedAddress}$`, $options: 'i' },
        isActive: true,
        'settings.notifications': true
      });

      console.log(`📊 Found ${users.length} users for wallet address: ${walletAddress}`);
      return users;
    } catch (error) {
      console.error('Error finding users by wallet address:', error);
      return [];
    }
  }

  /**
   * Send USDC transfer notification
   */
  async sendUSDCNotification(
    toAddress: string,
    fromAddress: string,
    amount: string,
    transactionHash: string,
    network: string = 'base-mainnet'
  ): Promise<void> {
    try {
      if (!this.botToken) {
        console.log('⚠️  USDC notification skipped - BOT_TOKEN not set');
        return;
      }

      const users = await this.findUsersByWalletAddress(toAddress);
      
      if (users.length === 0) {
        console.log(`No users found for wallet address: ${toAddress}`);
        return;
      }

      const message = this.formatUSDCNotification(fromAddress, amount, transactionHash, network);
      
      for (const user of users) {
        const success = await this.sendMessage(user.telegramId, message);
        if (success) {
          console.log(`✅ USDC notification sent to user ${user.telegramId} (${user.username || user.firstName || 'Unknown'})`);
        } else {
          console.error(`❌ Failed to send USDC notification to user ${user.telegramId}`);
        }
      }
    } catch (error) {
      console.error('Error sending USDC notification:', error);
    }
  }

  /**
   * Send ETH transfer notification
   */
  async sendETHNotification(
    toAddress: string,
    fromAddress: string,
    amount: string,
    transactionHash: string,
    network: string = 'base-mainnet'
  ): Promise<void> {
    try {
      if (!this.botToken) {
        console.log('⚠️  ETH notification skipped - BOT_TOKEN not set');
        return;
      }

      const users = await this.findUsersByWalletAddress(toAddress);
      
      if (users.length === 0) {
        console.log(`No users found for wallet address: ${toAddress}`);
        return;
      }

      const message = this.formatETHNotification(fromAddress, amount, transactionHash, network);
      
      for (const user of users) {
        const success = await this.sendMessage(user.telegramId, message);
        if (success) {
          console.log(`✅ ETH notification sent to user ${user.telegramId} (${user.username || user.firstName || 'Unknown'})`);
        } else {
          console.error(`❌ Failed to send ETH notification to user ${user.telegramId}`);
        }
      }
    } catch (error) {
      console.error('Error sending ETH notification:', error);
    }
  }

  /**
   * Format USDC notification message
   */
  public formatUSDCNotification(fromAddress: string, amount: string, transactionHash: string, network: string): string {
    const shortFrom = `${fromAddress.slice(0, 6)}...${fromAddress.slice(-4)}`;
    const shortHash = `${transactionHash.slice(0, 6)}...${transactionHash.slice(-4)}`;
    const networkName = network === 'base-mainnet' ? 'Base' : network;
    
    return `💵 <b>USDC Received!</b>

💰 <b>Amount:</b> ${amount} USDC
👤 <b>From:</b> <code>${shortFrom}</code>
🔗 <b>Transaction:</b> <code>${shortHash}</code>
🌐 <b>Network:</b> ${networkName}

<a href="https://basescan.org/tx/${transactionHash}">View on BaseScan</a>`;
  }

  /**
   * Format ETH notification message
   */
  public formatETHNotification(fromAddress: string, amount: string, transactionHash: string, network: string): string {
    const shortFrom = `${fromAddress.slice(0, 6)}...${fromAddress.slice(-4)}`;
    const shortHash = `${transactionHash.slice(0, 6)}...${transactionHash.slice(-4)}`;
    const networkName = network === 'base-mainnet' ? 'Base' : network;
    
    return `🪙 <b>ETH Received!</b>

💰 <b>Amount:</b> ${amount} ETH
👤 <b>From:</b> <code>${shortFrom}</code>
🔗 <b>Transaction:</b> <code>${shortHash}</code>
🌐 <b>Network:</b> ${networkName}

<a href="https://basescan.org/tx/${transactionHash}">View on BaseScan</a>`;
  }

  /**
   * Send copy trade success notification
   */
  async sendCopyTradeNotification(
    accountName: string,
    targetWalletAddress: string,
    tokenSymbol: string,
    tokenName: string,
    copiedAmount: string,
    transactionHash: string,
    originalTxHash: string
  ): Promise<void> {
    try {
      if (!this.botToken) {
        console.log('⚠️  Copy trade notification skipped - BOT_TOKEN not set');
        return;
      }

      // Find users by account name (assuming account name is linked to user)
      const users = await this.findUsersByAccountName(accountName);
      
      if (users.length === 0) {
        console.log(`No users found for account name: ${accountName}`);
        return;
      }

      const message = this.formatCopyTradeNotification(
        targetWalletAddress,
        tokenSymbol,
        tokenName,
        copiedAmount,
        transactionHash,
        originalTxHash
      );
      
      for (const user of users) {
        const success = await this.sendMessage(user.telegramId, message);
        if (success) {
          console.log(`✅ Copy trade notification sent to user ${user.telegramId} (${user.username || user.firstName || 'Unknown'})`);
        } else {
          console.error(`❌ Failed to send copy trade notification to user ${user.telegramId}`);
        }
      }
    } catch (error) {
      console.error('Error sending copy trade notification:', error);
    }
  }

  /**
   * Find users by account name
   */
  async findUsersByAccountName(accountName: string): Promise<IUser[]> {
    try {
      console.log(`🔍 Searching for users with account name: ${accountName}`);
      
      const users = await User.find({
        'settings.cdpAccountName': accountName,
        isActive: true,
        'settings.notifications': true
      });

      console.log(`📊 Found ${users.length} users for account name: ${accountName}`);
      return users;
    } catch (error) {
      console.error('Error finding users by account name:', error);
      return [];
    }
  }

  /**
   * Format copy trade notification message
   */
  public formatCopyTradeNotification(
    targetWalletAddress: string,
    tokenSymbol: string,
    tokenName: string,
    copiedAmount: string,
    transactionHash: string,
    originalTxHash: string
  ): string {
    const shortTarget = `${targetWalletAddress.slice(0, 6)}...${targetWalletAddress.slice(-4)}`;
    const shortTxHash = `${transactionHash.slice(0, 6)}...${transactionHash.slice(-4)}`;
    const shortOriginalTx = `${originalTxHash.slice(0, 6)}...${originalTxHash.slice(-4)}`;
    
    return `🎯 <b>Copy Trade Executed Successfully!</b>

🪙 <b>Token:</b> ${tokenSymbol} (${tokenName})
💰 <b>Amount:</b> ${copiedAmount} ETH
👤 <b>Target Wallet:</b> <code>${shortTarget}</code>
🔗 <b>Copy Trade TX:</b> <code>${shortTxHash}</code>
📋 <b>Original TX:</b> <code>${shortOriginalTx}</code>

✅ <b>Status:</b> Successfully mirrored the trade!

<a href="https://basescan.org/tx/${transactionHash}">View Copy Trade on BaseScan</a>
<a href="https://basescan.org/tx/${originalTxHash}">View Original Trade on BaseScan</a>`;
  }

  /**
   * Send failed copy trade notification
   */
  async sendFailedCopyTradeNotification(
    accountName: string,
    targetWalletAddress: string,
    tokenSymbol: string,
    tokenName: string,
    errorMessage: string
  ): Promise<void> {
    try {
      if (!this.botToken) {
        console.log('⚠️  Failed copy trade notification skipped - BOT_TOKEN not set');
        return;
      }

      // Find users by account name
      const users = await this.findUsersByAccountName(accountName);
      
      if (users.length === 0) {
        console.log(`No users found for account name: ${accountName}`);
        return;
      }

      const message = this.formatFailedCopyTradeNotification(
        targetWalletAddress,
        tokenSymbol,
        tokenName,
        errorMessage
      );
      
      for (const user of users) {
        const success = await this.sendMessage(user.telegramId, message);
        if (success) {
          console.log(`✅ Failed copy trade notification sent to user ${user.telegramId} (${user.username || user.firstName || 'Unknown'})`);
        } else {
          console.error(`❌ Failed to send failed copy trade notification to user ${user.telegramId}`);
        }
      }
    } catch (error) {
      console.error('Error sending failed copy trade notification:', error);
    }
  }

  /**
   * Format failed copy trade notification message
   */
  public formatFailedCopyTradeNotification(
    targetWalletAddress: string,
    tokenSymbol: string,
    tokenName: string,
    errorMessage: string
  ): string {
    const shortTarget = `${targetWalletAddress.slice(0, 6)}...${targetWalletAddress.slice(-4)}`;
    
    return `❌ <b>Copy Trade Failed!</b>

🪙 <b>Token:</b> ${tokenSymbol} (${tokenName})
👤 <b>Target Wallet:</b> <code>${shortTarget}</code>
🚫 <b>Error:</b> ${errorMessage}

⚠️ <b>Status:</b> Failed to mirror the trade

💡 <b>Possible reasons:</b>
• Insufficient delegation amount
• Low liquidity for the token
• Network congestion
• Slippage too high

Please check your copy trade configuration and try again.`;
  }
}

import mongoose, { Schema, Document, Model } from 'mongoose';

export interface CopyTradeEventDoc extends Document {
  configId: string;
  accountName: string;
  targetWalletAddress: string;
  originalTxHash: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string;
  originalAmount: string;
  copiedAmount: string;
  transactionHash: string;
  timestamp: number;
  status: 'pending' | 'success' | 'failed';
  errorMessage?: string;
}

const CopyTradeEventSchema = new Schema<CopyTradeEventDoc>({
  configId: { type: String, required: true, index: true },
  accountName: { type: String, required: true, index: true },
  targetWalletAddress: { type: String, required: true, lowercase: true, index: true },
  originalTxHash: { type: String, required: true, index: true },
  tokenAddress: { type: String, required: true },
  tokenSymbol: { type: String, required: true },
  tokenName: { type: String, required: true },
  originalAmount: { type: String, required: true },
  copiedAmount: { type: String, required: true },
  transactionHash: { type: String, required: true },
  timestamp: { type: Number, required: true, default: () => Date.now() },
  status: { type: String, enum: ['pending', 'success', 'failed'], required: true },
  errorMessage: { type: String },
});

// Uniqueness per config to avoid collisions when multiple configs monitor the same wallet
CopyTradeEventSchema.index({ configId: 1, originalTxHash: 1 }, { unique: true });

export const CopyTradeEventModel: Model<CopyTradeEventDoc> = mongoose.models.CopyTradeEvent || mongoose.model<CopyTradeEventDoc>('CopyTradeEvent', CopyTradeEventSchema);



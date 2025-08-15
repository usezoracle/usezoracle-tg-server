import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  telegramId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  walletAddress?: string;
  isActive: boolean;
  lastActive: Date;
  createdAt: Date;
  updatedAt: Date;
  settings: {
    notifications: boolean;
    language: string;
    timezone: string;
    cdpAccountName?: string;
  };
}

const UserSchema = new Schema<IUser>(
  {
    telegramId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    username: {
      type: String,
      sparse: true,
    },
    firstName: String,
    lastName: String,
    walletAddress: {
      type: String,
      sparse: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastActive: {
      type: Date,
      default: Date.now,
    },
    settings: {
      notifications: {
        type: Boolean,
        default: true,
      },
      language: {
        type: String,
        default: "en",
      },
      timezone: {
        type: String,
        default: "UTC",
      },
      cdpAccountName: {
        type: String,
        sparse: true,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Remove duplicate telegramId index - it's already defined above with index: true
UserSchema.index({ isActive: 1 });

export const User = mongoose.model<IUser>("User", UserSchema, "users_new");

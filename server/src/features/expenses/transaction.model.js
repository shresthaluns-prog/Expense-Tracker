import mongoose from "mongoose";
import { CATEGORY_TYPES } from "../categories/category.model.js";

export const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "mobile_wallet", "other"];

const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    type: {
      type: String,
      enum: CATEGORY_TYPES,
      required: true,
    },
    // Integer in the currency's minor unit (for example, 1234 NPR = Rs. 12.34).
    amountMinor: {
      type: Number,
      required: true,
      min: 1,
      max: Number.MAX_SAFE_INTEGER,
      validate: {
        validator: Number.isSafeInteger,
        message: "amountMinor must be a safe integer in the currency's minor unit.",
      },
    },
    currency: {
      type: String,
      required: true,
      default: "NPR",
      uppercase: true,
      match: [/^[A-Z]{3}$/, "currency must be a three-letter ISO 4217 code."],
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    paymentMethod: {
      type: String,
      enum: PAYMENT_METHODS,
      default: "other",
    },
  },
  { timestamps: true },
);

transactionSchema.index(
  { userId: 1, type: 1, date: -1 },
  { name: "transaction_user_type_date" },
);
transactionSchema.index(
  { userId: 1, categoryId: 1, date: -1 },
  { name: "transaction_user_category_date" },
);

const Transaction =
  mongoose.models.Transaction ?? mongoose.model("Transaction", transactionSchema);

export default Transaction;

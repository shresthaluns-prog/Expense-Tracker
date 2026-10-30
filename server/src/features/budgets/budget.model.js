import mongoose from "mongoose";

export const BUDGET_PERIOD_TYPES = ["weekly", "monthly", "custom"];

const budgetSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Null represents an overall budget; an ObjectId represents a category budget.
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
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
    periodType: {
      type: String,
      enum: BUDGET_PERIOD_TYPES,
      required: true,
      default: "custom",
    },
    currency: {
      type: String,
      required: true,
      default: "NPR",
      uppercase: true,
      match: [/^[A-Z]{3}$/, "currency must be a three-letter ISO 4217 code."],
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
      validate: {
        validator(value) {
          return !this.startDate || value > this.startDate;
        },
        message: "endDate must be later than startDate.",
      },
    },
  },
  { timestamps: true },
);

budgetSchema.index(
  { userId: 1, categoryId: 1, currency: 1, startDate: 1, endDate: 1 },
  { unique: true, name: "budget_user_category_period_unique" },
);
budgetSchema.index(
  { userId: 1, startDate: 1, endDate: 1 },
  { name: "budget_user_period" },
);

const Budget = mongoose.models.Budget ?? mongoose.model("Budget", budgetSchema);

export default Budget;

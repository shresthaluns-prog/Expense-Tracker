import mongoose from "mongoose";

export const CATEGORY_TYPES = ["income", "expense"];

const categorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 60,
    },
    type: {
      type: String,
      required: true,
      enum: CATEGORY_TYPES,
    },
    color: {
      type: String,
      default: "#64748b",
      match: [/^#[\da-f]{6}$/i, "color must be a six-digit hex color."],
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

categorySchema.index(
  { userId: 1, type: 1, name: 1 },
  {
    unique: true,
    collation: { locale: "en", strength: 2 },
    name: "category_user_type_name_unique",
  },
);
categorySchema.index(
  { userId: 1, type: 1, isArchived: 1 },
  { name: "category_user_type_archived" },
);

const Category = mongoose.models.Category ?? mongoose.model("Category", categorySchema);

export default Category;

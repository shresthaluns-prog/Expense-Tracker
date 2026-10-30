import "dotenv/config";
import mongoose from "mongoose";
import Category from "../src/features/categories/category.model.js";
import { ensureDefaultExpenseCategories } from "../src/features/categories/default-categories.js";
import User from "../src/features/auth/user.model.js";

await mongoose.connect(process.env.MONGODB_URI);
try {
  const users = await User.find({}, { _id: 1 }).lean();
  for (const user of users) {
    await ensureDefaultExpenseCategories(Category, user._id);
  }
  console.info(`Ensured default expense categories for ${users.length} users.`);
} finally {
  await mongoose.disconnect();
}

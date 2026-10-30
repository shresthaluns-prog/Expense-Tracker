import mongoose from "mongoose";
import { env } from "./env.js";

export async function connectToDatabase() {
  await mongoose.connect(env.mongodbUri);
  console.info("Connected to MongoDB.");
}

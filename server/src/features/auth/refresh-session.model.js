import mongoose from "mongoose";

const refreshSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      select: false,
      match: [/^[a-f\d]{64}$/i, "tokenHash must be a SHA-256 hex digest."],
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    replacedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RefreshSession",
      default: null,
    },
  },
  { timestamps: true },
);

refreshSessionSchema.index(
  { tokenHash: 1 },
  { unique: true, name: "refresh_session_token_hash_unique" },
);
refreshSessionSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: "refresh_session_expiry_ttl" },
);
refreshSessionSchema.index(
  { userId: 1, revokedAt: 1, expiresAt: 1 },
  { name: "refresh_session_user_status_expiry" },
);

const RefreshSession =
  mongoose.models.RefreshSession ?? mongoose.model("RefreshSession", refreshSessionSchema);

export default RefreshSession;

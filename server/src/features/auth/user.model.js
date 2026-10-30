import mongoose from "mongoose";
import isEmail from "validator/lib/isEmail.js";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      validate: {
        validator: (value) => isEmail(value),
        message: "Email must be a valid email address.",
      },
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
      validate: {
        validator: (value) => /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value),
        message: "passwordHash must contain a bcrypt hash, not a plaintext password.",
      },
    },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true, name: "user_email_unique" });

const User = mongoose.models.User ?? mongoose.model("User", userSchema);

export default User;

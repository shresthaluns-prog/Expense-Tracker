import { env } from "../config/env.js";
import User from "../features/auth/user.model.js";
import { createAuthService } from "../features/auth/auth.service.js";

const authService = createAuthService({
  UserModel: User,
  accessTokenSecret: env.accessTokenSecret,
  accessTokenTtl: env.accessTokenTtl,
});

export async function requireAuthenticatedUser(req, res, next) {
  const authorization = req.get("authorization");
  const match = authorization && /^Bearer ([^\s]+)$/i.exec(authorization);

  try {
    req.authUser = await authService.authenticateAccessToken(match?.[1] ?? null);
    next();
  } catch (error) {
    next(error);
  }
}

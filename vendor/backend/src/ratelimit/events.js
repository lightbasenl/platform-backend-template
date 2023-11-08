import { AppError, isProduction } from "@compas/stdlib";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { app } from "../services.js";

/**
 * Apply rate limits to auth related routes.
 *
 * The limits are enforced per instance of the backend. We may want to re-evaluate this
 * when backends are scaling to tens of instances.
 *
 * This functionality can be tested by removing the `!isProduction()` check.
 */
export function rateLimitInject() {
  const authPasswordBasedRateLimiter = new RateLimiterMemory({
    // Allow 11 requests..
    points: 11,

    // every 60 seconds...
    duration: 60,

    // if blocked, block for
    // 10 minutes
    blockDuration: 10 * 60,
  });

  app.use(async (ctx, next) => {
    if (
      !isProduction() ||
      ctx.method.toLowerCase() === "get" ||
      !ctx.path.startsWith("/auth/password")
    ) {
      // Only rate limit authPasswordBased related POST/PUT calls.
      // We shouldn't restrict all of /auth, but only routes that could result in
      // brute-force attacks or user enumeration.
      return next();
    }

    try {
      // Limiting login attempts
      if (ctx.path === "/auth/password-based/login") {
        await authPasswordBasedRateLimiter.consume(ctx.ip, 2);
      } else {
        await authPasswordBasedRateLimiter.consume(ctx.ip, 1);
      }
    } catch (e) {
      // Wrap-up, so upstream middleware will automatically set the correct response
      // status.
      throw new AppError(`server.internal.rateLimit`, 429, {}, e);
    }

    return next();
  });
}

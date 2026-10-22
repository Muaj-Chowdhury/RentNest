import { NextFunction, Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import config from "../config";
import { AppError } from "../errors/AppError";

/**
 * Protects maintenance endpoints that are triggered by Vercel Cron.
 *
 * Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` on cron
 * invocations when a CRON_SECRET environment variable is set. The comparison is
 * constant-time so the secret cannot be probed by timing. When CRON_SECRET is
 * not configured the endpoint rejects every request.
 */
export const cronAuth = (req: Request, _res: Response, next: NextFunction) => {
  const secret = config.cron_secret;

  if (!secret) {
    throw new AppError("Unauthorized", 401);
  }

  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(req.headers.authorization ?? "");

  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    throw new AppError("Unauthorized", 401);
  }

  next();
};

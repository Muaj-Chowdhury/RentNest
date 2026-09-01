/**
 * Authentication Middleware
 * 
 * Verifies JWT token, checks user roles, fetches user from database,
 * verifies active status, and attaches user data to request object
 * for downstream route handlers.
 */

import { NextFunction, Request, Response } from "express";
import { JwtPayload } from "jsonwebtoken";
import { Role } from "../../generated/prisma/enums";
import config from "../config";
import prisma from "../lib/prisma";
import { catchAsync } from "../utils/catchAsync";
import { verifyToken } from "../utils/jwt";
import { AppError } from "../errors/AppError";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        role: Role;
      };
    }
  }
}
export const auth = (...requiredRoles: Role[]) => {
  return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies.accessToken
      ? req.cookies.accessToken
      : req.headers.authorization?.startsWith("Bearer")
        ? req.headers.authorization.split(" ")[1]
        : req.headers.authorization;

    if (!token) {
      throw new AppError("Unauthorized", 401);
    }
    const verifiedToken = verifyToken(token, config.jwt_access_secret);
    if (!verifiedToken.success) throw new AppError("Invalid or expired token", 401);

    const { id } = verifiedToken.data as JwtPayload & {
      id: string;
    };

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true, status: true },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }
    if (user.status !== "ACTIVE") {
      throw new AppError("User is not active", 403);
    }
    if (!requiredRoles.includes(user.role)) {
      throw new AppError(
        "Forbidden. You don't have permission to access this resource.",
        403,
      );
    }
    req.user = {
      email: user.email,
      name: user.name,
      id: user.id,
      role: user.role,
    };
    next();
  });
};

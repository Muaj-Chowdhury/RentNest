// auth middleware function that recieves roles and verify token roles ,find user in db and active status set user in req.user object and pass to next middleware based on global types.

import { NextFunction, Request, Response } from "express";
import { JwtPayload } from "jsonwebtoken";
import { Role } from "../../generated/prisma/enums";
import config from "../config";
import prisma from "../lib/prisma";
import { catchAsync } from "../utils/catchAsync";
import { verifyToken } from "../utils/jwt";

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
      throw new Error("Unauthorized");
    }
    const verifiedToken = verifyToken(token, config.jwt_access_secret);
    if (!verifiedToken.success) throw new Error(verifiedToken.error);

    const { name, email, id, role } = verifiedToken.data as JwtPayload & {
      id: string;
      email: string;
      name: string;
      role: Role;
    };

    if (!requiredRoles.includes(role)) {
      throw new Error(
        "Forbidden. You don't have permission to access this resource.",
      );
    }
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new Error("User not found");
    }
    if (user.status !== "ACTIVE") {
      throw new Error("User is not active");
    }
    req.user = {
      email,
      name,
      id,
      role,
    };
    next();
  });
};

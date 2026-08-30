import { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError";
import { UserStatus } from "../../generated/prisma/enums";

declare global {
  namespace Express {
    interface Request {
      validatedBody?: Record<string, unknown>;
    }
  }
}

const asObject = (body: unknown) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AppError("Request body must be an object", 400);
  }
  return body as Record<string, unknown>;
};

const nextWithBody = (body: Record<string, unknown>, next: NextFunction, req: Request) => {
  req.validatedBody = body;
  next();
};

export const validateUpdateProfile = (req: Request, _res: Response, next: NextFunction) => {
  const body = asObject(req.body);
  const keys = Object.keys(body);
  if (keys.length === 0 || keys.some((key) => key !== "name")) {
    throw new AppError("Only name can be updated", 400);
  }
  if (typeof body.name !== "string" || body.name.trim().length < 2 || body.name.trim().length > 255) {
    throw new AppError("Name must be between 2 and 255 characters", 400);
  }
  nextWithBody({ name: body.name.trim() }, next, req);
};

export const validateChangePassword = (req: Request, _res: Response, next: NextFunction) => {
  const body = asObject(req.body);
  const keys = Object.keys(body);
  if (keys.length !== 2 || !keys.includes("currentPassword") || !keys.includes("newPassword")) {
    throw new AppError("currentPassword and newPassword are required", 400);
  }
  for (const field of ["currentPassword", "newPassword"]) {
    const value = body[field];
    if (typeof value !== "string" || value.length < 8 || value.length > 128) {
      throw new AppError(`${field} must be between 8 and 128 characters`, 400);
    }
  }
  nextWithBody({ currentPassword: body.currentPassword, newPassword: body.newPassword }, next, req);
};

export const validateUserStatus = (req: Request, _res: Response, next: NextFunction) => {
  const body = asObject(req.body);
  if (Object.keys(body).length !== 1 || typeof body.status !== "string") {
    throw new AppError("Status must be ACTIVE or BANNED", 400);
  }
  const status = body.status.toUpperCase();
  if (!Object.values(UserStatus).includes(status as UserStatus)) {
    throw new AppError("Status must be ACTIVE or BANNED", 400);
  }
  nextWithBody({ status }, next, req);
};

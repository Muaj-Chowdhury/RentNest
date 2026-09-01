import { Request, RequestHandler, Response, NextFunction } from "express";

/**
 * Async Error Handler Wrapper
 *
 * Wraps async route handlers to automatically catch errors and pass them
 * to the Express error handling middleware via next(error).
 *
 * Usage: router.get('/route', catchAsync(async (req, res) => { ... }))
 *
 * @param fn - The async route handler function
 * @returns Wrapped handler that catches all errors
 */
export const catchAsync = (fn: RequestHandler): RequestHandler => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      // Pass error to global error handling middleware
      next(error);
    }
  };
};

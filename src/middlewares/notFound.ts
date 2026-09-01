/**
 * 404 Not Found Handler Middleware
 * 
 * Catches requests to routes that don't exist and returns
 * a standardized 404 response with the requested path.
 * Should be placed at the end of middleware stack.
 */

import { Request, Response } from "express"

/**
 * Handles 404 errors for undefined routes
 * @param req - Express request object
 * @param res - Express response object
 */
export const notFound = (req: Request, res: Response) => {
    res.status(404).json({
        message: "Route not found",
        path: req.originalUrl,
        date: new Date()
    })
}
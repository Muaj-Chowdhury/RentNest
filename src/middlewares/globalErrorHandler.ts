/**
 * Global Error Handler Middleware
 * 
 * Centralized error handling for all application errors.
 * Handles Prisma validation errors, database errors, custom AppErrors,
 * and unexpected runtime errors with appropriate HTTP status codes.
 * 
 * Should be the last middleware in the Express app.
 */

import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { Prisma } from "../../generated/prisma/client";

/**
 * Global error handler middleware
 * @param err - The error object
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export const globalErrorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
    console.error("error", err);
    let statusCode: number = httpStatus.INTERNAL_SERVER_ERROR;
    let errorMessage = err?.message || "Internal Server Error";
    let errorName = err?.name || "Error";
    let errorDetails = err?.meta || err?.details || [];
    let errorStack = process.env.NODE_ENV !== "production" ? err?.stack || "" : undefined;

    if (typeof err?.statusCode === "number") {
        statusCode = err.statusCode;
    }

    if (err instanceof Prisma.PrismaClientValidationError) {
        statusCode = httpStatus.BAD_REQUEST;
        errorMessage = "Validation failed: invalid or missing data.";
    } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
        switch (err.code) {
            case "P2002":
                statusCode = httpStatus.CONFLICT;
                errorMessage = "Unique constraint failed. Duplicate value exists.";
                break;
            case "P2003":
                statusCode = httpStatus.BAD_REQUEST;
                errorMessage = "Foreign key constraint failed. Related record not found.";
                break;
            case "P2011":
                statusCode = httpStatus.BAD_REQUEST;
                errorMessage = "Null constraint failed: a required field is missing.";
                break;
            case "P2012":
                statusCode = httpStatus.BAD_REQUEST;
                errorMessage = "Missing required value for a required field.";
                break;
            case "P2024":
                statusCode = httpStatus.SERVICE_UNAVAILABLE;
                errorMessage = "Database connection timed out. Please try again later.";
                break;
            case "P2025":
                statusCode = httpStatus.NOT_FOUND;
                errorMessage = "Record not found.";
                break;
            case "P2021":
                statusCode = httpStatus.INTERNAL_SERVER_ERROR;
                errorMessage = "Table not found. Database schema mismatch.";
                break;
            case "P2022":
                statusCode = httpStatus.INTERNAL_SERVER_ERROR;
                errorMessage = "Column not found. Database schema mismatch.";
                break;
            default:
                statusCode = httpStatus.BAD_REQUEST;
                errorMessage = "Database request error.";
                break;
        }
    } else if (err instanceof Prisma.PrismaClientInitializationError) {
        statusCode = httpStatus.INTERNAL_SERVER_ERROR;
        errorMessage = "Database unavailable. Please try again later.";
    } else if (err instanceof Prisma.PrismaClientUnknownRequestError) {
        statusCode = httpStatus.INTERNAL_SERVER_ERROR;
        errorMessage = "Unknown database error. Please try again later.";
    } else if (err instanceof Prisma.PrismaClientRustPanicError) {
        statusCode = httpStatus.INTERNAL_SERVER_ERROR;
        errorMessage = "Database engine crashed.";
    }

    const payload: any = {
        success: false,
        name: errorName,
        message: errorMessage,
        details: errorDetails,
    };

    if (process.env.NODE_ENV !== "production") {
        payload.stack = errorStack;
    }

    res.status(statusCode).json(payload);
};

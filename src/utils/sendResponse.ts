/**
 * Response Type Definitions
 * Metadata type for paginated responses
 */
type TMeta = {
    page: number;
    limit: number;
    total: number;
}

/**
 * Standard API response structure for all endpoints
 */
type TResponse<T> = {
    success: boolean;
    statusCode: number;
    message: string;
    data: T;
    meta?: TMeta
}

import { Response } from "express";

/**
 * Standardized response sender utility
 * Ensures consistent JSON response format across all API endpoints
 */
export const sendResponse = <T> (res: Response, data: TResponse<T>) => {
    res.status(data.statusCode).json({
        success: data.success,
        message: data.message,
        data: data.data,
        meta: data.meta
    })
}
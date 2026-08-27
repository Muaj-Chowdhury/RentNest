//sendResponse function
type TMeta = {
    page: number;
    limit: number;
    total: number;
}
type TResponse<T> = {
    success: boolean;
    statusCode: number;
    message: string;
    data: T;
    meta?: TMeta
}
import { Response } from "express";

export const sendResponse =<T> (res: Response, data: TResponse<T>) => {
    res.status(data.statusCode).json({
        success: data.success,
        message: data.message,
        data: data.data,
        meta: data.meta
    })
}
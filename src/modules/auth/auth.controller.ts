import type { Request, Response, NextFunction } from "express";
import { AuthService } from "./auth.service";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";
import { get } from "node:http";

const authService = new AuthService();

export class AuthController {
  register = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
      const payload = req.body;
      const user = await authService.register(payload);
      sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "User created successfully",
        data: user,
      });
    },
  );

  login = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
      const result = await authService.login(req.body);
      const { accessToken, refreshToken } = result;
      //cookie sending
      res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: false,
        sameSite: "none",
        maxAge: 1000 * 60 * 60 * 24, // 24 hour or 1 day
      });
      //refresh token for 7 days
      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: false,
        sameSite: "none",
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      });
      sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "User logged in successfully",
        data: result,
      });
    },
  );

  getProfile = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const result = await authService.getProfile(req.user?.id as string);
    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: "User profile fetched successfully",
      data: result,
    });
  });
}

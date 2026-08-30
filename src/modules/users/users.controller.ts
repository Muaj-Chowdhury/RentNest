import type { Request, Response } from "express";
import { AppError } from "../../errors/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { UserStatus } from "../../../generated/prisma/enums";
import { IChangePasswordPayload, IUpdateProfilePayload } from "./users.interface";
import { UsersService } from "./users.service";

const usersService = new UsersService();

export class UsersController {
  private getAuthenticatedUser(req: Request) {
    if (!req.user) {
      throw new AppError("Unauthorized", 401);
    }

    return req.user;
  }

  private parsePagination(req: Request) {
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);

    if (!Number.isInteger(page) || page < 1) {
      throw new AppError("page must be a positive integer", 400);
    }

    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new AppError("limit must be an integer between 1 and 100", 400);
    }

    return { page, limit };
  }

  getMyProfile = catchAsync(async (req: Request, res: Response) => {
    const user = this.getAuthenticatedUser(req);
    const profile = await usersService.getMyProfile(user.id);

    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "User profile fetched successfully",
      data: profile,
    });
  });

  updateMyProfile = catchAsync(async (req: Request, res: Response) => {
    const user = this.getAuthenticatedUser(req);
    const profile = await usersService.updateMyProfile(
      user.id,
      (req.validatedBody ?? req.body) as IUpdateProfilePayload,
    );

    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "User profile updated successfully",
      data: profile,
    });
  });

  changePassword = catchAsync(async (req: Request, res: Response) => {
    const user = this.getAuthenticatedUser(req);
    const result = await usersService.changePassword(
      user.id,
      (req.validatedBody ?? req.body) as IChangePasswordPayload,
    );

    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "Password changed successfully",
      data: result,
    });
  });

  getAllUsers = catchAsync(async (req: Request, res: Response) => {
    const actor = this.getAuthenticatedUser(req);
    const { page, limit } = this.parsePagination(req);
    const result = await usersService.getAllUsers(actor, page, limit);

    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "Users fetched successfully",
      data: result.users,
      meta: result.meta,
    });
  });

  getUserById = catchAsync(async (req: Request, res: Response) => {
    const actor = this.getAuthenticatedUser(req);
    const id = typeof req.params.id === "string" ? req.params.id : "";
    const user = await usersService.getUserById(id, actor);

    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "User fetched successfully",
      data: user,
    });
  });

  updateUserStatus = catchAsync(async (req: Request, res: Response) => {
    const actor = this.getAuthenticatedUser(req);
    const id = typeof req.params.id === "string" ? req.params.id : "";
    const statusValue = typeof req.validatedBody?.status === "string"
      ? req.validatedBody.status
      : "";

    if (!Object.values(UserStatus).includes(statusValue as UserStatus)) {
      throw new AppError("Status must be ACTIVE or BANNED", 400);
    }

    const user = await usersService.updateUserStatus(
      id,
      statusValue as UserStatus,
      actor,
    );

    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: `User ${statusValue.toLowerCase()} successfully`,
      data: user,
    });
  });

}

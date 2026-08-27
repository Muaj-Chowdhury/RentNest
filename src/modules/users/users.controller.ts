import type { Request, Response } from "express";
import { UsersService } from "./users.service";
import { catchAsync } from "../../utils/catchAsync";

const usersService = new UsersService();

export class UsersController {
  getAllUsers = catchAsync(async (_req: Request, res: Response) => {
    const users = await usersService.getAllUsers();
    res.status(200).json(users);
  });

  getUserById = catchAsync(async (req: Request, res: Response) => {
    const id = typeof req.params.id === "string" ? req.params.id : "";
    const user = await usersService.getUserById(id);
    res.status(200).json(user);
  });

  updateUser = catchAsync(async (req: Request, res: Response) => {
    const id = typeof req.params.id === "string" ? req.params.id : "";
    const updatedUser = await usersService.updateUser(id, req.body);
    res.status(200).json(updatedUser);
  });

  deleteUser = catchAsync(async (req: Request, res: Response) => {
    const id = typeof req.params.id === "string" ? req.params.id : "";
    const result = await usersService.deleteUser(id);
    res.status(200).json(result);
  });
}

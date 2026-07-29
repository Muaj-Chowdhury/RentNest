import { Request, Response, NextFunction } from "express";
import { UsersService } from "./users.service";

const usersService = new UsersService();

export class UsersController {
  async getAllUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const users = await usersService.getAllUsers();
      res.status(200).json(users);
    } catch (error) {
      next(error);
    }
  }

  async getUserById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await usersService.getUserById(req.params.id);
      res.status(200).json(user);
    } catch (error) {
      next(error);
    }
  }

  async updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const updatedUser = await usersService.updateUser(req.params.id, req.body);
      res.status(200).json(updatedUser);
    } catch (error) {
      next(error);
    }
  }

  async deleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await usersService.deleteUser(req.params.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

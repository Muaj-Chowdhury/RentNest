import { Request, Response, NextFunction } from "express";
import { CategoriesService } from "./categories.service";

const categoriesService = new CategoriesService();

export class CategoriesController {
  async getAllCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const categories = await categoriesService.getAllCategories();
      res.status(200).json(categories);
    } catch (error) {
      next(error);
    }
  }

  async createCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const category = await categoriesService.createCategory(req.body);
      res.status(201).json(category);
    } catch (error) {
      next(error);
    }
  }

  async deleteCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await categoriesService.deleteCategory(req.params.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

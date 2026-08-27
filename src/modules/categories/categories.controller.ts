import type { Request, Response } from "express";
import { CategoriesService } from "./categories.service";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";

const categoriesService = new CategoriesService();

export class CategoriesController {
  getAllCategories = catchAsync(async (_req: Request, res: Response) => {
    const categories = await categoriesService.getAllCategories();
    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: "Categories fetched successfully",
      data: categories,
    });
  });

  createCategory = catchAsync(async (req: Request, res: Response) => {
    const category = await categoriesService.createCategory(req.body);
    sendResponse(res, {
      success: true,
      statusCode: httpStatus.CREATED,
      message: "Category created successfully",
      data: category,
    });
  });

  updateCategory = catchAsync(async (req: Request, res: Response) => {
    const id = typeof req.params.id === "string" ? req.params.id : "";
    const category = await categoriesService.updateCategory(id, req.body);
    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: "Category updated successfully",
      data: category,
    });
  });

  deleteCategory = catchAsync(async (req: Request, res: Response) => {
    const id = typeof req.params.id === "string" ? req.params.id : "";
    const result = await categoriesService.deleteCategory(id);
    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: result.message,
      data: null,
    });
  });
}

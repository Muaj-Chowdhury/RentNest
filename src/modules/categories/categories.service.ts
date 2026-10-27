import prisma from "../../lib/prisma";
import { ICreateCategoryPayload } from "./categories.interface";
import { AppError } from "../../errors/AppError";

export class CategoriesService {
  async getAllCategories() {
    return prisma.category.findMany({
      orderBy: { createdAt: "asc" },
    });
  }

  async createCategory(payload: ICreateCategoryPayload) {
    const { name } = payload;
    const normalizedName = name.trim();

    if (!normalizedName) {
      throw new AppError("Category name is required", 400);
    }

    const isCategoryExists = await prisma.category.findFirst({
      where: { name: normalizedName },
    });

    if (isCategoryExists) {
      throw new AppError("Category already exists", 409);
    }

    return prisma.category.create({
      data: { name: normalizedName },
    });
  }

  async updateCategory(id: string, payload: ICreateCategoryPayload) {
    const { name } = payload;
    const normalizedName = name.trim();

    if (!normalizedName) {
      throw new AppError("Category name is required", 400);
    }

    const existingCategory = await prisma.category.findUnique({
      where: { id },
    });
    if (!existingCategory) {
      throw new AppError("Category not found", 404);
    }

    const duplicateCategory = await prisma.category.findFirst({
      where: { name: normalizedName, NOT: { id } },
    });

    if (duplicateCategory) {
      throw new AppError("Category already exists", 409);
    }

    return prisma.category.update({
      where: { id },
      data: { name: normalizedName },
    });
  }

  async deleteCategory(id: string) {
    const existingCategory = await prisma.category.findUnique({
      where: { id },
    });
    if (!existingCategory) {
      throw new AppError("Category not found", 404);
    }

    const propertyCount = await prisma.property.count({ where: { categoryId: id } });
    if (propertyCount > 0) {
      throw new AppError("Category cannot be deleted while properties use it", 409);
    }

    await prisma.category.delete({ where: { id } });
    return { message: "Category deleted successfully" };
  }
}

import prisma from "../../lib/prisma";
import { ICreateCategoryPayload } from "./categories.interface";

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
      throw new Error("Category name is required");
    }

    const isCategoryExists = await prisma.category.findFirst({
      where: { name: normalizedName },
    });

    if (isCategoryExists) {
      throw new Error("Category already exists");
    }

    return prisma.category.create({
      data: { name: normalizedName },
    });
  }

  async updateCategory(id: string, payload: ICreateCategoryPayload) {
    const { name } = payload;
    const normalizedName = name.trim();

    if (!normalizedName) {
      throw new Error("Category name is required");
    }

    const existingCategory = await prisma.category.findUnique({
      where: { id },
    });
    if (!existingCategory) {
      throw new Error("Category not found");
    }

    const duplicateCategory = await prisma.category.findFirst({
      where: { name: normalizedName, NOT: { id } },
    });

    if (duplicateCategory) {
      throw new Error("Category already exists");
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
      throw new Error("Category not found");
    }

    await prisma.category.delete({ where: { id } });
    return { message: "Category deleted successfully" };
  }
}

export class CategoriesService {
  async getAllCategories() {
    return [];
  }

  async createCategory(data: any) {
    return { id: "new-category-id", ...data };
  }

  async deleteCategory(id: string) {
    return { id, deleted: true };
  }
}

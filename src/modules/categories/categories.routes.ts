import { Router } from "express";
import { CategoriesController } from "./categories.controller";

const router = Router();
const categoriesController = new CategoriesController();

router.get("/", categoriesController.getAllCategories);
router.post("/", categoriesController.createCategory);
router.delete("/:id", categoriesController.deleteCategory);

export default router;

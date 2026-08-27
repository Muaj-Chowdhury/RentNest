import { Router } from "express";
import { CategoriesController } from "./categories.controller";
import { auth } from "../../middlewares/auth";
import { Role } from "../../../generated/prisma/enums";

const router = Router();
const categoriesController = new CategoriesController();

router.get("/", categoriesController.getAllCategories);
router.post("/", auth(Role.ADMIN), categoriesController.createCategory);
router.patch("/:id", auth(Role.ADMIN), categoriesController.updateCategory);
router.delete("/:id", auth(Role.ADMIN), categoriesController.deleteCategory);

export const categoryRoutes = router;

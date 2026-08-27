import { Router } from "express";
import { UsersController } from "./users.controller";

const router = Router();
const usersController = new UsersController();

router.get("/", usersController.getAllUsers);
router.get("/:id", usersController.getUserById);
router.put("/:id", usersController.updateUser);
router.delete("/:id", usersController.deleteUser);

export const userRoutes = router;

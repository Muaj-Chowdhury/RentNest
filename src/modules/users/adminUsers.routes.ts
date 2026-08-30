import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middlewares/auth";
import { validateUserStatus } from "../../middlewares/validation";
import { UsersController } from "./users.controller";

const router = Router();
const usersController = new UsersController();

router.use(auth(Role.ADMIN));
router.get("/", usersController.getAllUsers);
router.get("/:id", usersController.getUserById);
router.patch("/:id/status", validateUserStatus, usersController.updateUserStatus);
// Compatibility alias matching the assignment's example endpoint.
router.patch("/:id", validateUserStatus, usersController.updateUserStatus);

export const adminUserRoutes = router;

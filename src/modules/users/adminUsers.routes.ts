import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middlewares/auth";
import { UsersController } from "./users.controller";

const router = Router();
const usersController = new UsersController();

router.use(auth(Role.ADMIN));
router.get("/", usersController.getAllUsers);
router.get("/:id", usersController.getUserById);
router.patch("/:id/status", usersController.updateUserStatus);
// DELETE is a soft delete: user history must remain attached to rentals and
// reviews, so the account is deactivated instead of being physically removed.
router.delete("/:id", usersController.deleteUser);

export const adminUserRoutes = router;

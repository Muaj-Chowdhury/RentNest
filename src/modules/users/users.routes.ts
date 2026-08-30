import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middlewares/auth";
import { UsersController } from "./users.controller";
import { validateChangePassword, validateUpdateProfile } from "../../middlewares/validation";

const router = Router();
const usersController = new UsersController();

router.get(
  "/me",
  auth(Role.TENANT, Role.LANDLORD, Role.ADMIN),
  usersController.getMyProfile,
);
router.patch(
  "/me",
  auth(Role.TENANT, Role.LANDLORD, Role.ADMIN),
  validateUpdateProfile,
  usersController.updateMyProfile,
);
router.patch(
  "/me/password",
  auth(Role.TENANT, Role.LANDLORD, Role.ADMIN),
  validateChangePassword,
  usersController.changePassword,
);

export const userRoutes = router;

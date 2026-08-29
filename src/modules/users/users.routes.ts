import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middlewares/auth";
import { UsersController } from "./users.controller";

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
  usersController.updateMyProfile,
);
router.patch(
  "/me/password",
  auth(Role.TENANT, Role.LANDLORD, Role.ADMIN),
  usersController.changePassword,
);

export const userRoutes = router;

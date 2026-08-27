import { Router } from "express";
import { AuthController } from "./auth.controller";
import { auth } from "../../middlewares/auth";
import { Role } from "../../../generated/prisma/enums";

const router = Router();
const authController = new AuthController();
//(alias) type Role = "TENANT" | "LANDLORD" | "ADMIN"
router.post("/register", authController.register);
router.post("/login", authController.login);
router.get("/me", auth(Role.ADMIN, Role.LANDLORD, Role.TENANT), authController.getProfile);

export const authRoutes = router;

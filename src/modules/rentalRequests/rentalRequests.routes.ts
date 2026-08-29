import { Router } from "express";
import { RentalRequestsController } from "./rentalRequests.controller";
import { auth } from "../../middlewares/auth";
import { Role } from "../../../generated/prisma/enums";

const router = Router();
const rentalRequestsController = new RentalRequestsController();

router.get(
  "/",
  auth(Role.TENANT, Role.LANDLORD, Role.ADMIN),
  rentalRequestsController.getAllRequests,
);
router.get("/:id",auth(Role.TENANT, Role.LANDLORD, Role.ADMIN), rentalRequestsController.getRequestById);
router.post("/",auth(Role.TENANT), rentalRequestsController.createRequest);
router.patch("/:id/status",auth(Role.LANDLORD, Role.ADMIN), rentalRequestsController.updateRequestStatus);
router.patch(
  "/:id/complete",
  auth(Role.LANDLORD, Role.ADMIN),
  rentalRequestsController.completeRequest,
);

export const rentalRequestRoutes = router;

import { Router } from "express";
import { RentalRequestsController } from "./rentalRequests.controller";

const router = Router();
const rentalRequestsController = new RentalRequestsController();

router.get("/", rentalRequestsController.getAllRequests);
router.get("/:id", rentalRequestsController.getRequestById);
router.post("/", rentalRequestsController.createRequest);
router.patch("/:id/status", rentalRequestsController.updateRequestStatus);

export default router;

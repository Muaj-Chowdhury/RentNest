import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middlewares/auth";
import { PropertiesController } from "../properties/properties.controller";
import { RentalRequestsController } from "../rentalRequests/rentalRequests.controller";

const router = Router();
const propertiesController = new PropertiesController();
const rentalRequestsController = new RentalRequestsController();

router.use(auth(Role.ADMIN));

// Admins can inspect every listing, including unavailable properties. The
// public properties endpoint defaults to available=true.
router.get("/properties", propertiesController.getAllProperties);
router.get("/rentals", rentalRequestsController.getAllRequests);

export const adminOverviewRoutes = router;

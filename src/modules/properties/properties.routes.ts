import { Router } from "express";
import { PropertiesController } from "./properties.controller";
import { auth } from "../../middlewares/auth";
import { Role } from "../../../generated/prisma/enums";

const router = Router();
const propertiesController = new PropertiesController();

router.post("/", auth(Role.LANDLORD), propertiesController.createProperty);
router.post(
  "/bulk",
  auth(Role.LANDLORD),
  propertiesController.createPropertiesBulk,
);

router.get("/", propertiesController.getAllProperties);

router.get("/:id", propertiesController.getPropertyById);

router.put("/:id", auth(Role.LANDLORD), propertiesController.updateProperty);

router.delete("/:id", auth(Role.LANDLORD), propertiesController.deleteProperty);

router.patch(
  "/:id/availability",
  auth(Role.LANDLORD),
  propertiesController.updateAvailability,
);

export const propertyRoutes = router;

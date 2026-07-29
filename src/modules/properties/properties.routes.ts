import { Router } from "express";
import { PropertiesController } from "./properties.controller";

const router = Router();
const propertiesController = new PropertiesController();

router.get("/", propertiesController.getAllProperties);
router.get("/:id", propertiesController.getPropertyById);
router.post("/", propertiesController.createProperty);
router.put("/:id", propertiesController.updateProperty);
router.delete("/:id", propertiesController.deleteProperty);

export default router;

import { Router } from "express";
import { PaymentsController } from "./payments.controller";

const router = Router();
const paymentsController = new PaymentsController();

router.get("/", paymentsController.getAllPayments);
router.get("/:id", paymentsController.getPaymentById);
router.post("/", paymentsController.processPayment);

export default router;

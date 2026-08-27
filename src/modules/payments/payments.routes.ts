import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middlewares/auth";
import { PaymentsController } from "./payments.controller";

const router = Router();
const paymentsController = new PaymentsController();

router.post(
  "/create",
  auth(Role.TENANT),
  paymentsController.createPayment,
);

router.post(
  "/confirm",
  paymentsController.confirmPayment,
);

router.post(
  "/ipn",
  paymentsController.handleIpn,
);

router.post(
  "/success",
  paymentsController.handleSuccess,
);

router.post(
  "/fail",
  paymentsController.handleFail,
);

router.post(
  "/cancel",
  paymentsController.handleCancel,
);

router.get(
  "/",
  auth(Role.TENANT, Role.LANDLORD, Role.ADMIN),
  paymentsController.getAllPayments,
);

router.get(
  "/:id",
  auth(Role.TENANT, Role.LANDLORD, Role.ADMIN),
  paymentsController.getPaymentById,
);

export const paymentRoutes = router;
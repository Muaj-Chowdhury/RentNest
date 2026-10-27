import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middlewares/auth";
import { cronAuth } from "../../middlewares/cronAuth";
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
  auth(Role.ADMIN),
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

// Fallback landing page for the browser callbacks while there is no frontend.
// Point PAYMENT_RESULT_URL here; it must stay above "/:id".
router.get(
  "/result",
  paymentsController.showResult,
);

router.get(
  "/expire-reservations",
  cronAuth,
  paymentsController.expireReservations,
);

router.get(
  "/:id",
  auth(Role.TENANT, Role.LANDLORD, Role.ADMIN),
  paymentsController.getPaymentById,
);

// Landlords can view payments but not drive gateway queries or payment state
// changes on a tenant's checkout.
router.post(
  "/:id/reconcile",
  auth(Role.TENANT, Role.ADMIN),
  paymentsController.reconcilePayment,
);

export const paymentRoutes = router;

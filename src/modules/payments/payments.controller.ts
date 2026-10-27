import type { Request, Response } from "express";
import { PaymentStatus } from "../../../generated/prisma/enums";
import config from "../../config";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { PaymentsService } from "./payments.service";
import { ICreatePaymentPayload } from "./payments.interface";
import { AppError } from "../../errors/AppError";

const paymentsService = new PaymentsService();

const getActor = (req: Request) => {
  if (!req.user) {
    throw new AppError("Unauthorized", 401);
  }

  return {
    id: req.user.id,
    role: req.user.role,
  };
};

const redirectToResultPage = (
  res: Response,
  result: { paymentId: string | null; status: string; message: string },
) => {
  const url = new URL(config.payment_result_url);

  if (result.paymentId) url.searchParams.set("paymentId", result.paymentId);
  url.searchParams.set("status", result.status);
  url.searchParams.set("message", result.message);

  res.redirect(303, url.toString());
};

export class PaymentsController {
  createPayment = catchAsync(async (req: Request, res: Response) => {
    const actor = getActor(req);

    const payment = await paymentsService.createPayment(
      req.body as ICreatePaymentPayload,
      actor.id,
    );

    sendResponse(res, {
      success: true,
      statusCode: 201,
      message: "Payment session created successfully",
      data: payment,
    });
  });

  getAllPayments = catchAsync(async (req: Request, res: Response) => {
    const actor = getActor(req);

    const pageValue = Number(req.query.page ?? 1);
    const limitValue = Number(req.query.limit ?? 20);

    const page = Number.isFinite(pageValue) ? pageValue : 1;
    const limit = Number.isFinite(limitValue) ? limitValue : 20;

    const result = await paymentsService.getAllPayments(
      actor,
      page,
      limit,
    );

    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "Payments fetched successfully",
      data: result.payments,
      meta: result.meta,
    });
  });

  getPaymentById = catchAsync(async (req: Request, res: Response) => {
    const actor = getActor(req);
    const id = typeof req.params.id === "string" ? req.params.id : "";

    const payment = await paymentsService.getPaymentById(id, actor);

    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "Payment fetched successfully",
      data: payment,
    });
  });

  reconcilePayment = catchAsync(async (req: Request, res: Response) => {
    const actor = getActor(req);
    const id = typeof req.params.id === "string" ? req.params.id : "";
    const result = await paymentsService.reconcilePayment(id, actor);

    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: result.message,
      data: result,
    });
  });

  confirmPayment = catchAsync(async (req: Request, res: Response) => {
    const payment = await paymentsService.confirmPayment(req.body);

    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "Payment confirmed successfully",
      data: payment,
    });
  });

  handleIpn = catchAsync(async (req: Request, res: Response) => {
    const payment = await paymentsService.handleIpn(req.body);

    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "IPN processed successfully",
      data: payment,
    });
  });

  // SSLCommerz POSTs the tenant's browser to these three URLs. They redirect
  // (303, so the browser follows with GET) to the frontend result page
  // instead of leaving the tenant on a raw JSON response.
  handleSuccess = catchAsync(async (req: Request, res: Response) => {
    redirectToResultPage(
      res,
      await paymentsService.handleBrowserCallback(req.body, "success"),
    );
  });

  handleFail = catchAsync(async (req: Request, res: Response) => {
    redirectToResultPage(
      res,
      await paymentsService.handleBrowserCallback(req.body, "fail"),
    );
  });

  handleCancel = catchAsync(async (req: Request, res: Response) => {
    redirectToResultPage(
      res,
      await paymentsService.handleBrowserCallback(req.body, "cancel"),
    );
  });

  // Shows the outcome the callbacks put in the redirect. The query string is
  // only informational; GET /api/payments/:id is the source of truth.
  showResult = catchAsync(async (req: Request, res: Response) => {
    const read = (key: string) =>
      typeof req.query[key] === "string" ? req.query[key] : null;
    const status = read("status") ?? "UNKNOWN";

    sendResponse(res, {
      success: status === PaymentStatus.COMPLETED,
      statusCode: 200,
      message: read("message") ?? "No payment result was provided.",
      data: { paymentId: read("paymentId"), status },
    });
  });

  expireReservations = catchAsync(async (_req: Request, res: Response) => {
    const result = await paymentsService.expirePaymentReservations();

    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "Expired payment reservations processed",
      data: result,
    });
  });
}

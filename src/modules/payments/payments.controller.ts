import type { Request, Response } from "express";
import { Role } from "../../../generated/prisma/enums";
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

  handleSuccess = catchAsync(async (req: Request, res: Response) => {
    const payment = await paymentsService.confirmPayment(req.body);

    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "Payment successful",
      data: payment,
    });
  });

  handleFail = catchAsync(async (req: Request, res: Response) => {
    const payment = await paymentsService.handleFailureCallback(
      req.body,
      "FAILED",
    );

    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "Payment failed",
      data: payment,
    });
  });

  handleCancel = catchAsync(async (req: Request, res: Response) => {
    const payment = await paymentsService.handleFailureCallback(
      req.body,
      "CANCELLED",
    );

    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "Payment cancelled",
      data: payment,
    });
  });
}

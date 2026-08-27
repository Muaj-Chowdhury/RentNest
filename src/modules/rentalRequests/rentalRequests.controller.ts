import type { Request, Response } from "express";
import { RentalRequestsService } from "./rentalRequests.service";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import {
  IRentalRequestQuery,
  RentalRequestStatusField,
  RentalRequestStatusFields,
} from "./rentalRequests.interface";
import { RentalRequestStatus } from "../../../generated/prisma/enums";

const rentalRequestsService = new RentalRequestsService();

export class RentalRequestsController {
  getAllRequests = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new Error("Unauthorized");
    }

    const statusParam = req.query.status
      ? String(req.query.status).toUpperCase()
      : undefined;

    const validStatuses = Object.values(RentalRequestStatus) as string[];

    if (statusParam && !validStatuses.includes(statusParam)) {
      throw new Error("Invalid rental request status");
    }

    const query: IRentalRequestQuery = {
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      status: statusParam as RentalRequestStatus | undefined,
    };

    const result = await rentalRequestsService.getAllRequests(req.user, query);

    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "Rental requests fetched successfully",
      data: result.requests,
      meta: result.meta,
    });
  });

  getRequestById = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new Error("Unauthorized");
    }

    const id = typeof req.params.id === "string" ? req.params.id : "";

    const request = await rentalRequestsService.getRequestById(id, req.user);

    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "Rental request fetched successfully",
      data: request,
    });
  });

  createRequest = catchAsync(async (req: Request, res: Response) => {
    const tenantId = typeof req.user?.id === "string" ? req.user?.id : "";
    if (!tenantId) {
      throw new Error("Unauthorized");
    }
    const request = await rentalRequestsService.createRequest(
      req.body,
      tenantId,
    );
    sendResponse(res, {
      success: true,
      statusCode: 201,
      message: "Rental request created successfully",
      data: request,
    });
  });

  updateRequestStatus = catchAsync(async (req: Request, res: Response) => {
    const id = typeof req.params.id === "string" ? req.params.id : "";
    if (!id) {
      throw new Error("Request ID is required");
    }
    if (!req.body.status) throw new Error("Status is required");

    // Create an object map for instant validation and proper type matching
    const statusMap: Record<string, RentalRequestStatusField> = {
      APPROVED: RentalRequestStatus.APPROVED,
      REJECTED: RentalRequestStatus.REJECTED,
    };

    const normalizedStatus = String(req.body.status).toUpperCase();
    const status = statusMap[normalizedStatus];

    if (!status) {
      throw new Error("Status must be APPROVED or REJECTED");
    }

    if (!req.user) {
      throw new Error("Unauthorized");
    }
    const updatedRequest = await rentalRequestsService.updateRequestStatus(
      id,
      status,
      req.user,
    );
    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: `Rental request ${status.toLowerCase()} successfully`,
      data: updatedRequest,
    });
  });
}

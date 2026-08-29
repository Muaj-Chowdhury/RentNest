import type { Request, Response } from "express";
import { AppError } from "../../errors/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import {
  ICreateReviewPayload,
  IReviewQuery,
  ReviewSortFields,
} from "./reviews.interface";
import { ReviewsService } from "./reviews.service";

const reviewsService = new ReviewsService();

export class ReviewsController {
  private static readonly UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  private static readonly MAX_COMMENT_LENGTH = 2_000;

  private isUuid(value: string) {
    return ReviewsController.UUID_REGEX.test(value);
  }

  private validateReviewPayload(body: unknown): ICreateReviewPayload {
    if (!body || typeof body !== "object") {
      throw new AppError("Invalid review payload", 400);
    }

    const { propertyId, rating, comment } = body as Record<string, unknown>;

    if (
      typeof propertyId !== "string" ||
      !this.isUuid(propertyId.trim())
    ) {
      throw new AppError(
        "propertyId is required and must be a valid UUID",
        400,
      );
    }

    if (
      typeof rating !== "number" ||
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5
    ) {
      throw new AppError("rating must be an integer between 1 and 5", 400);
    }

    if (typeof comment !== "string") {
      throw new AppError("comment is required", 400);
    }

    const normalizedComment = comment.trim();

    if (
      normalizedComment.length < 5 ||
      normalizedComment.length > ReviewsController.MAX_COMMENT_LENGTH
    ) {
      throw new AppError(
        `comment must be between 5 and ${ReviewsController.MAX_COMMENT_LENGTH} characters`,
        400,
      );
    }

    return {
      propertyId: propertyId.trim(),
      rating,
      comment: normalizedComment,
    };
  }

  private parseOptionalInteger(
    value: unknown,
    field: string,
    minimum: number,
    maximum?: number,
  ) {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "string" || !/^\d+$/.test(value)) {
      throw new AppError(`${field} must be a valid integer`, 400);
    }

    const parsed = Number(value);

    if (
      !Number.isSafeInteger(parsed) ||
      parsed < minimum ||
      (maximum !== undefined && parsed > maximum)
    ) {
      throw new AppError(`${field} is outside the allowed range`, 400);
    }

    return parsed;
  }

  getReviewsForProperty = catchAsync(async (req: Request, res: Response) => {
    const propertyId =
      typeof req.params.propertyId === "string"
        ? req.params.propertyId.trim()
        : "";

    if (!this.isUuid(propertyId)) {
      throw new AppError("propertyId must be a valid UUID", 400);
    }

    const rating = this.parseOptionalInteger(req.query.rating, "rating", 1, 5);
    const page = this.parseOptionalInteger(req.query.page, "page", 1);
    const limit = this.parseOptionalInteger(req.query.limit, "limit", 1, 100);

    const comment = req.query.comment;
    if (comment !== undefined && typeof comment !== "string") {
      throw new AppError("comment must be a string", 400);
    }

    const normalizedComment =
      typeof comment === "string" ? comment.trim() : undefined;
    if (normalizedComment !== undefined && normalizedComment.length > 100) {
      throw new AppError("comment search is too long", 400);
    }

    const sortBy = req.query.sortBy;
    if (
      sortBy !== undefined &&
      (typeof sortBy !== "string" ||
        !ReviewSortFields.includes(
          sortBy as (typeof ReviewSortFields)[number],
        ))
    ) {
      throw new AppError("sortBy must be createdAt or rating", 400);
    }

    const sortOrder = req.query.sortOrder;
    if (
      sortOrder !== undefined &&
      sortOrder !== "asc" &&
      sortOrder !== "desc"
    ) {
      throw new AppError("sortOrder must be asc or desc", 400);
    }

    const query: IReviewQuery = {
      rating,
      comment: normalizedComment || undefined,
      page,
      limit,
      sortBy: sortBy as IReviewQuery["sortBy"],
      sortOrder: sortOrder as IReviewQuery["sortOrder"],
    };

    const reviews = await reviewsService.getReviewsForProperty(
      propertyId,
      query,
    );

    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "Reviews fetched successfully",
      data: reviews.data,
      meta: reviews.meta,
    });
  });

  createReview = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError("Unauthorized", 401);
    }

    const data = this.validateReviewPayload(req.body);
    const review = await reviewsService.createReview(req.user.id, data);

    sendResponse(res, {
      success: true,
      statusCode: 201,
      message: "Review created successfully",
      data: review,
    });
  });

  deleteReview = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError("Unauthorized", 401);
    }

    const id = typeof req.params.id === "string" ? req.params.id : "";
    const review = await reviewsService.deleteReview(id, {
      id: req.user.id,
      role: req.user.role,
    });

    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "Review deleted successfully",
      data: review,
    });
  });
}

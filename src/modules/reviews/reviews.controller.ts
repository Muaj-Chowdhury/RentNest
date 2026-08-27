import type { Request, Response } from "express";
import { ReviewsService } from "./reviews.service";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { IReviewQuery, ReviewSortField } from "./reviews.interface";

const reviewsService = new ReviewsService();

export class ReviewsController {
  private static readonly UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  private async validateReviewPayload(body: any): Promise<{ error?: string; data?: any }> {
    if (!body || typeof body !== "object") {
      return { error: "Invalid payload" };
    }

    const { propertyId, rating, comment } = body as any;

    if (!propertyId || typeof propertyId !== "string" || ReviewsController.UUID_REGEX.test(propertyId) === false) {
      return { error: "propertyId is required and must be a valid UUID" };
    }

    if (rating == null || typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return { error: "rating is required and must be a number" };
    }

    if (!comment  || typeof comment !== "string" || comment.trim().length < 5) {
      return { error: "comment must be a string with at least 5 characters" };
    }

    return { data: { propertyId, rating, comment } };
  }
  getReviewsForProperty = catchAsync(async (req: Request, res: Response) => {
    const propertyId = typeof req.params.propertyId === "string" ? req.params.propertyId : "";
    
    const {rating , comment , page , limit , sortBy , sortOrder} = req.query
    if(!rating || typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5){
      return { error: "rating is required and must be a number" };
    }
    if(!comment || typeof comment !== "string" || comment.trim().length < 5){
      return { error: "comment must be a string with at least 5 characters" };
    }
    const validQuerySortFields: Record<ReviewSortField, string> = {
      createdAt: "createdAt",
      rating: "rating",
    };
    const querySort =
      typeof req.query.sortBy === "string" && req.query.sortBy in validQuerySortFields
        ? (req.query.sortBy as ReviewSortField)
        : "createdAt";

    const query: IReviewQuery = {
      sortBy: querySort,
      sortOrder: typeof req.query.sortOrder === "string" && (req.query.sortOrder === "asc" || req.query.sortOrder === "desc") ? req.query.sortOrder : "desc",
      page: typeof req.query.page === "string" ? Number(req.query.page) : 1,
      limit: typeof req.query.limit === "string" ? Number(req.query.limit) : 10,
    };
    const reviews = await reviewsService.getReviewsForProperty(propertyId, query);
    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "Reviews fetched successfully",
      data: reviews,
    });
  });

  createReview = catchAsync(async (req: Request, res: Response) => {
    const tenantId = req.user?.id === "string" ? req.user.id : "";
    const { data } = await this.validateReviewPayload(req.body);
    const review = await reviewsService.createReview(tenantId, data);
    sendResponse(res, {
      success: true,
      statusCode: 201,
      message: "Review created successfully",
      data: review,
    })
  });

  deleteReview = catchAsync(async (req: Request, res: Response) => {
    const id = typeof req.params.id === "string" ? req.params.id : "";
    const result = await reviewsService.deleteReview(id);
    res.status(200).json(result);
  });
}

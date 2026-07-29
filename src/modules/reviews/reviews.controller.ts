import { Request, Response, NextFunction } from "express";
import { ReviewsService } from "./reviews.service";

const reviewsService = new ReviewsService();

export class ReviewsController {
  async getReviewsForProperty(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const reviews = await reviewsService.getReviewsForProperty(req.params.propertyId);
      res.status(200).json(reviews);
    } catch (error) {
      next(error);
    }
  }

  async createReview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const review = await reviewsService.createReview(req.body);
      res.status(201).json(review);
    } catch (error) {
      next(error);
    }
  }

  async deleteReview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await reviewsService.deleteReview(req.params.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

import { Router } from "express";
import { ReviewsController } from "./reviews.controller";

const router = Router();
const reviewsController = new ReviewsController();

router.get("/property/:propertyId", reviewsController.getReviewsForProperty);
router.post("/", reviewsController.createReview);
router.delete("/:id", reviewsController.deleteReview);

export const reviewRoutes = router;

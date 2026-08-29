import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middlewares/auth";
import { ReviewsController } from "./reviews.controller";

const router = Router();
const reviewsController = new ReviewsController();

router.get("/property/:propertyId", reviewsController.getReviewsForProperty);
router.post("/", auth(Role.TENANT), reviewsController.createReview);
router.delete(
  "/:id",
  auth(Role.TENANT, Role.ADMIN),
  reviewsController.deleteReview,
);

export const reviewRoutes = router;

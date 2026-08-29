import { Prisma } from "../../../generated/prisma/client";
import {
  PaymentStatus,
  RentalRequestStatus,
  Role,
} from "../../../generated/prisma/enums";
import { AppError } from "../../errors/AppError";
import prisma from "../../lib/prisma";
import { ICreateReviewPayload, IReviewQuery } from "./reviews.interface";

type ReviewActor = {
  id: string;
  role: Role;
};

const reviewSelect = {
  id: true,
  propertyId: true,
  tenantId: true,
  rating: true,
  comment: true,
  createdAt: true,
  updatedAt: true,
  tenant: {
    select: {
      id: true,
      name: true,
    },
  },
  property: {
    select: {
      id: true,
      title: true,
      location: true,
    },
  },
} satisfies Prisma.ReviewSelect;

export class ReviewsService {
  async getReviewsForProperty(propertyId: string, query: IReviewQuery = {}) {
    if (!propertyId) {
      throw new AppError("Property ID is required", 400);
    }

    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true },
    });

    if (!property) {
      throw new AppError("Property not found", 404);
    }

    const currentPage = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(Math.max(1, query.limit ?? 20), 100);
    const skip = (currentPage - 1) * pageSize;
    const where: Prisma.ReviewWhereInput = { propertyId };

    if (query.rating !== undefined) {
      where.rating = query.rating;
    }

    if (query.comment) {
      where.comment = {
        contains: query.comment,
        mode: "insensitive",
      };
    }

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: {
          [query.sortBy ?? "createdAt"]: query.sortOrder ?? "desc",
        },
        select: reviewSelect,
      }),
      prisma.review.count({ where }),
    ]);

    return {
      data: reviews,
      meta: {
        page: currentPage,
        limit: pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async createReview(tenantId: string, data: ICreateReviewPayload) {
    if (!tenantId) {
      throw new AppError("Unauthorized", 401);
    }

    const property = await prisma.property.findUnique({
      where: { id: data.propertyId },
      select: { id: true },
    });

    if (!property) {
      throw new AppError("Property not found", 404);
    }

    // A review is available only to a tenant who has a verified paid rental
    // for this property. ACTIVE is useful while the tenant is still renting;
    // COMPLETED keeps the review available after move-out.
    const eligibleRental = await prisma.rentalRequest.findFirst({
      where: {
        tenantId,
        propertyId: data.propertyId,
        status: {
          in: [RentalRequestStatus.ACTIVE, RentalRequestStatus.COMPLETED],
        },
        payment: {
          is: {
            status: PaymentStatus.COMPLETED,
          },
        },
      },
      select: { id: true },
    });

    if (!eligibleRental) {
      throw new AppError(
        "You can review a property only after a verified active or completed rental",
        403,
      );
    }

    try {
      return await prisma.review.create({
        data: {
          tenantId,
          propertyId: data.propertyId,
          rating: data.rating,
          comment: data.comment,
        },
        select: reviewSelect,
      });
    } catch (error) {
      // The database unique constraint remains the final protection against
      // two concurrent requests creating two reviews for the same rental.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new AppError("You have already reviewed this property", 409);
      }

      throw error;
    }
  }

  async deleteReview(id: string, actor: ReviewActor) {
    if (!id) {
      throw new AppError("Review ID is required", 400);
    }

    const review = await prisma.review.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
      },
    });

    if (!review) {
      throw new AppError("Review not found", 404);
    }

    if (actor.role !== Role.ADMIN && review.tenantId !== actor.id) {
      throw new AppError("You can delete only your own review", 403);
    }

    return prisma.review.delete({
      where: { id: review.id },
      select: reviewSelect,
    });
  }
}

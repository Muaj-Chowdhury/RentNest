import { ICreateReviewPayload, IReviewQuery } from "./reviews.interface";
import { Prisma } from "../../../generated/prisma/client";
import prisma from "../../lib/prisma";

export class ReviewsService {
  async getReviewsForProperty(propertyId: string , query: IReviewQuery) {
    const { rating , comment , page , limit , sortBy , sortOrder} = query
    const currentPage = Math.max(1, page ?? 1);
    const pageSize = Math.min(Math.max(1, limit ?? 20), 100);
    const skip = (currentPage - 1) * pageSize;

    const where: Prisma.ReviewWhereInput = {};
    if(propertyId) where.propertyId = propertyId;

    if(rating) where.rating = rating;
    if(comment) where.comment = comment;

    const [reviews , count] = await Promise.all([
      prisma.review.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: {
          [sortBy]: sortOrder || "desc",
        },
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          property: {
            select: {
              id: true,
              title: true,
              location: true,
              amenities: true,
              rent: true,
              available: true,
              landlord: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          }
        }
      }),
      prisma.review.count({
        where,
      })
    ])
    return {
      data: reviews,
      metaData: {
        page: currentPage,
        pageSize,
        total: count,
        totalPages: Math.ceil(count / pageSize)
      }
    }
  }

    async createReview(tenantId: string, data: ICreateReviewPayload) {
      const { propertyId, rating, comment } = data;
      const review = await prisma.review.findFirst({
        where: {
          tenantId,
          propertyId,
        },
      })
      if (review) {
        throw new Error("Review already exists for this tenant and property");
      }
      await prisma.review.create({
        data: {
          tenantId,
          propertyId,
          rating,
          comment,
        }
      })
    }

  async deleteReview(id: string) {
    return { id, deleted: true };
  }
}

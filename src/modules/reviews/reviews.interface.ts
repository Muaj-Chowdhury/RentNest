export interface ICreateReviewPayload {
    propertyId: string;
    rating: number;
    comment: string;
}
export const ReviewSortFields = ["createdAt", "rating"] as const;
export type  ReviewSortField = typeof ReviewSortFields[number];
export interface IReviewQuery {
    rating: number;
    comment: string;
    page: number;
    limit: number;
    sortBy: string;
    sortOrder: string;
}
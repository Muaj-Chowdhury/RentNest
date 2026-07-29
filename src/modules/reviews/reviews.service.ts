export class ReviewsService {
  async getReviewsForProperty(propertyId: string) {
    return [];
  }

  async createReview(data: any) {
    return { id: "new-review-id", ...data };
  }

  async deleteReview(id: string) {
    return { id, deleted: true };
  }
}

export class RentalRequestsService {
  async getAllRequests() {
    return [];
  }

  async getRequestById(id: string) {
    return { id, status: "PENDING" };
  }

  async createRequest(data: any) {
    return { id: "new-request-id", ...data, status: "PENDING" };
  }

  async updateRequestStatus(id: string, status: string) {
    return { id, status };
  }
}

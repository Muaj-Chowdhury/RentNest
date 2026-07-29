export class PaymentsService {
  async getAllPayments() {
    return [];
  }

  async processPayment(data: any) {
    return { id: "new-payment-id", ...data, status: "COMPLETED" };
  }

  async getPaymentById(id: string) {
    return { id, amount: 100, status: "COMPLETED" };
  }
}

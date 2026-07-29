import { Request, Response, NextFunction } from "express";
import { PaymentsService } from "./payments.service";

const paymentsService = new PaymentsService();

export class PaymentsController {
  async getAllPayments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payments = await paymentsService.getAllPayments();
      res.status(200).json(payments);
    } catch (error) {
      next(error);
    }
  }

  async processPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payment = await paymentsService.processPayment(req.body);
      res.status(201).json(payment);
    } catch (error) {
      next(error);
    }
  }

  async getPaymentById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payment = await paymentsService.getPaymentById(req.params.id);
      res.status(200).json(payment);
    } catch (error) {
      next(error);
    }
  }
}

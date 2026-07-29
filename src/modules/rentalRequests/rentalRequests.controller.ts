import { Request, Response, NextFunction } from "express";
import { RentalRequestsService } from "./rentalRequests.service";

const rentalRequestsService = new RentalRequestsService();

export class RentalRequestsController {
  async getAllRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const requests = await rentalRequestsService.getAllRequests();
      res.status(200).json(requests);
    } catch (error) {
      next(error);
    }
  }

  async getRequestById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const request = await rentalRequestsService.getRequestById(req.params.id);
      res.status(200).json(request);
    } catch (error) {
      next(error);
    }
  }

  async createRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const request = await rentalRequestsService.createRequest(req.body);
      res.status(201).json(request);
    } catch (error) {
      next(error);
    }
  }

  async updateRequestStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const updatedRequest = await rentalRequestsService.updateRequestStatus(req.params.id, req.body.status);
      res.status(200).json(updatedRequest);
    } catch (error) {
      next(error);
    }
  }
}

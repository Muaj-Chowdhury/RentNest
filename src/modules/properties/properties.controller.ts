import { Request, Response, NextFunction } from "express";
import { PropertiesService } from "./properties.service";

const propertiesService = new PropertiesService();

export class PropertiesController {
  async getAllProperties(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const properties = await propertiesService.getAllProperties();
      res.status(200).json(properties);
    } catch (error) {
      next(error);
    }
  }

  async getPropertyById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const property = await propertiesService.getPropertyById(req.params.id);
      res.status(200).json(property);
    } catch (error) {
      next(error);
    }
  }

  async createProperty(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const property = await propertiesService.createProperty(req.body);
      res.status(201).json(property);
    } catch (error) {
      next(error);
    }
  }

  async updateProperty(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const updatedProperty = await propertiesService.updateProperty(req.params.id, req.body);
      res.status(200).json(updatedProperty);
    } catch (error) {
      next(error);
    }
  }

  async deleteProperty(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await propertiesService.deleteProperty(req.params.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

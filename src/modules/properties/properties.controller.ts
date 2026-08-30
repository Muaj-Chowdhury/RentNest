import type { Request, Response } from "express";
import { PropertiesService } from "./properties.service";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import {
  IPropertyQuery,
  PropertySortField,
  propertySortFields,
} from "./property.interface";

const propertiesService = new PropertiesService();

export class PropertiesController {
  getAllProperties = catchAsync(async (req: Request, res: Response) => {
    // 1. Create a validation and mapping object
    const validSortFields: Record<PropertySortField, string> = {
      createdAt: "createdAt",
      rent: "rent",
      title: "title",
    };

    // 2. Safely extract and check against the dictionary keys
    const querySort = String(req.query.sortBy);
    const sortBy: PropertySortField =
      querySort in validSortFields
        ? (querySort as PropertySortField)
        : "createdAt";

    const sortOrder = req.query.sortOrder === "asc" ? "asc" : "desc";

    const page = req.query.page ? Number(req.query.page) : 1;

    const limit = req.query.limit ? Number(req.query.limit) : 10;

    const amenities = req.query.amenities
      ? String(req.query.amenities)
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];

    // Public consumers should only see rentable listings by default. Admins
    // can omit the filter through the dedicated admin endpoint to inspect all
    // listings, including unavailable ones.
    let available: boolean | undefined = req.user?.role === "ADMIN" ? undefined : true;
    if (req.query.available !== undefined) {
      const availableParam = String(req.query.available).toLowerCase();
      if (availableParam === "true") {
        available = true;
      } else if (availableParam === "false") {
        available = false;
      }
    }
    const query: IPropertyQuery = {
      search: req.query.search ? String(req.query.search) : undefined,

      location: req.query.location ? String(req.query.location) : undefined,

      minRent: req.query.minRent ? Number(req.query.minRent) : undefined,

      maxRent: req.query.maxRent ? Number(req.query.maxRent) : undefined,

      categoryId: req.query.categoryId
        ? String(req.query.categoryId)
        : undefined,
      amenities,
      available,
      page,
      limit,
      sortBy,
      sortOrder,
    };
    const properties = await propertiesService.getAllProperties(query);
    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "Properties fetched successfully",
      data: properties,
    });
  });

  getPropertyById = catchAsync(async (req: Request, res: Response) => {
    const id = typeof req.params.id === "string" ? req.params.id : "";
    const property = await propertiesService.getPropertyById(id);
    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "Property fetched successfully",
      data: property,
    });
  });

  createProperty = catchAsync(async (req: Request, res: Response) => {
    const landlordId = req.user?.id;

    if (!landlordId) {
      throw new Error("Unauthorized");
    }

    const property = await propertiesService.createProperty(
      req.body,
      landlordId,
    );
    sendResponse(res, {
      success: true,
      statusCode: 201,
      message: "Property created successfully",
      data: property,
    });
  });

  createPropertiesBulk = catchAsync(async (req: Request, res: Response) => {
    const landlordId = req.user?.id;

    if (!landlordId) {
      throw new Error("Unauthorized");
    }

    const payloads = Array.isArray(req.body) ? req.body : [];

    if (payloads.length === 0) {
      throw new Error("No properties provided");
    }

    const created = await propertiesService.createPropertiesBulk(
      payloads,
      landlordId,
    );

    sendResponse(res, {
      success: true,
      statusCode: 201,
      message: "Properties created successfully",
      data: created,
    });
  });

  updateProperty = catchAsync(async (req: Request, res: Response) => {
    const id = typeof req.params.id === "string" ? req.params.id : "";
    const landlordId = req.user?.id;

    if (!landlordId) {
      throw new Error("Unauthorized");
    }

    const updatedProperty = await propertiesService.updateProperty(
      id,
      landlordId,
      req.body,
    );
    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "Property updated successfully",
      data: updatedProperty,
    });
  });

  updateAvailability = catchAsync(async (req: Request, res: Response) => {
    const landlordId = req.user?.id;
    const propertyId = typeof req.params.id === "string" ? req.params.id : "";

    if (!landlordId) {
      throw new Error("Unauthorized");
    }

    const property = await propertiesService.updateAvailability(
      propertyId,
      landlordId,
      req.body.available,
    );

    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "Property availability updated successfully",
      data: property,
    });
  });

  deleteProperty = catchAsync(async (req: Request, res: Response) => {
    const id = typeof req.params.id === "string" ? req.params.id : "";
    const landlordId = req.user?.id;

    if (!landlordId) {
      throw new Error("Unauthorized");
    }

    const result = await propertiesService.deleteProperty(id, landlordId);
    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "Property deleted successfully",
      data: result,
    });
  });
}

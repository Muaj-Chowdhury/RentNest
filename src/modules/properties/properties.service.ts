import { Prisma } from "../../../generated/prisma/client";
import { RentalRequestStatus } from "../../../generated/prisma/enums";
import prisma from "../../lib/prisma";
import { AppError } from "../../errors/AppError";
import {
  ICreatePropertyPayload,
  IPropertyQuery,
  IUpdatePropertyPayload,
} from "./property.interface";

export class PropertiesService {
  private validatePayload(payload: unknown, partial = false): ICreatePropertyPayload | IUpdatePropertyPayload {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new AppError("Invalid property payload", 400);
    }

    const body = payload as Record<string, unknown>;
    const allowed = new Set(["title", "location", "rent", "categoryId", "amenities", "available"]);
    if (Object.keys(body).some((key) => !allowed.has(key))) {
      throw new AppError("Invalid property field", 400);
    }
    if (partial && Object.keys(body).length === 0) {
      throw new AppError("At least one property field is required", 400);
    }
    if (partial && "available" in body) {
      throw new AppError("Use the availability endpoint to change property availability", 400);
    }
    if (!partial && !("title" in body && "location" in body && "rent" in body && "categoryId" in body)) {
      throw new AppError("title, location, rent and categoryId are required", 400);
    }
    if (body.title !== undefined && (typeof body.title !== "string" || body.title.trim().length < 2 || body.title.trim().length > 255)) {
      throw new AppError("title must be between 2 and 255 characters", 400);
    }
    if (body.location !== undefined && (typeof body.location !== "string" || body.location.trim().length < 2 || body.location.trim().length > 255)) {
      throw new AppError("location must be between 2 and 255 characters", 400);
    }
    if (body.rent !== undefined && (typeof body.rent !== "number" || !Number.isFinite(body.rent) || body.rent <= 0)) {
      throw new AppError("rent must be a positive number", 400);
    }
    if (body.categoryId !== undefined && (typeof body.categoryId !== "string" || !body.categoryId.trim())) {
      throw new AppError("categoryId is required", 400);
    }
    if (body.amenities !== undefined && (!Array.isArray(body.amenities) || body.amenities.some((item) => typeof item !== "string"))) {
      throw new AppError("amenities must be an array of strings", 400);
    }
    if (body.available !== undefined && typeof body.available !== "boolean") {
      throw new AppError("available must be a boolean", 400);
    }

    return {
      ...body,
      ...(typeof body.title === "string" ? { title: body.title.trim() } : {}),
      ...(typeof body.location === "string" ? { location: body.location.trim() } : {}),
      ...(typeof body.categoryId === "string" ? { categoryId: body.categoryId.trim() } : {}),
      ...(Array.isArray(body.amenities) ? { amenities: body.amenities.map((item) => (item as string).trim()).filter(Boolean) } : {}),
    } as ICreatePropertyPayload | IUpdatePropertyPayload;
  }

  async getAllProperties(query: IPropertyQuery) {
    //GET	/api/properties	Get all properties with filters (location, price, type)
    const {
      search,
      minRent,
      maxRent,
      categoryId,
      amenities,
      available,
      page,
      limit,
      sortBy,
      sortOrder,
      location,
    } = query;
    //pagination logic

    const currentPage = Math.max(1, page);

    const pageSize = Math.min(Math.max(1, limit), 100);

    const skip = (currentPage - 1) * pageSize;

    const where: Prisma.PropertyWhereInput = {};
    if (search) {
      where.OR = [
        {
          title: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          location: {
            contains: search,
            mode: "insensitive",
          },
        },
      ];
    }

    if (minRent !== undefined || maxRent !== undefined) {
      where.rent = {};
      if (minRent !== undefined) {
        where.rent.gte = minRent;
      }
      if (maxRent !== undefined) {
        where.rent.lte = maxRent;
      }
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }
    if (location) {
      where.location = {
        contains: String(location),
        mode: "insensitive",
      };
    }
    if (amenities.length > 0) {
      where.amenities = {
        hasEvery: amenities,
      };
    }

    if (available !== undefined) {
      where.available = available;
    }
    const [properties, total] = await Promise.all([
      prisma.property.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: {
          [sortBy]: sortOrder,
        },
        include: {
          category: true,
        },
      }),

      prisma.property.count({
        where,
      }),
    ]);

    return {
      meta: {
        page: currentPage,
        limit: pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      properties,
    };
  }
  //View detailed property listings

  async getPropertyById(id: string) {
    const property = await prisma.property.findUnique({
      where: { id },
      include: {
        landlord: {
          select: {
            id: true,
            name: true,
          },
        },
        category: true,
        reviews: {
          select: {
            rating: true,
            comment: true,
            tenant: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!property) {
      throw new Error("Property not found");
    }
    return property;
  }

  async createProperty(payload: ICreatePropertyPayload, landlordId: string) {
    const validated = this.validatePayload(payload) as ICreatePropertyPayload;
    const { title, location, rent, categoryId, amenities, available } = validated;

    const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } });
    if (!category) throw new AppError("Category not found", 404);

    return prisma.property.create({
      data: {
        title,
        location,
        rent,
        categoryId,
        amenities: amenities ?? [],
        landlordId,
        available,
      },
    });
  }

  async createPropertiesBulk(
    payloads: ICreatePropertyPayload[],
    landlordId: string,
  ) {
    if (!Array.isArray(payloads) || payloads.length === 0) {
      throw new Error("No properties provided");
    }

    const validatedPayloads = payloads.map((payload) => this.validatePayload(payload) as ICreatePropertyPayload);
    const categoryIds = [...new Set(validatedPayloads.map((p) => p.categoryId))];
    const categories = await prisma.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true } });
    if (categories.length !== categoryIds.length) throw new AppError("One or more categories were not found", 404);

    const createData = validatedPayloads.map((p) => ({
      title: p.title,
      location: p.location,
      rent: p.rent,
      categoryId: p.categoryId,
      amenities: p.amenities ?? [],
      landlordId,
      available: p.available,
    }));

    // Use a transaction to create all records and return created items
    const created = await prisma.$transaction(
      createData.map((d) => prisma.property.create({ data: d })),
    );

    return created;
  }

  async updateProperty(
    id: string,
    landlordId: string,
    payload: IUpdatePropertyPayload,
  ) {
    const validated = this.validatePayload(payload, true) as IUpdatePropertyPayload;
    const property = await prisma.property.findFirst({
      where: {
        id,
        landlordId,
      },
    });

    if (!property) {
      throw new Error("Property not found");
    }

    if (validated.categoryId) {
      const category = await prisma.category.findUnique({ where: { id: validated.categoryId }, select: { id: true } });
      if (!category) throw new AppError("Category not found", 404);
    }

    return prisma.property.update({
      where: { id },
      data: validated,
    });
  }
  async updateAvailability(id: string, landlordId: string, available: boolean) {
    if (typeof available !== "boolean") {
      throw new AppError("available must be a boolean", 400);
    }

    return prisma.$transaction(
      async (tx) => {
        const property = await tx.property.findFirst({
          where: { id, landlordId },
          select: { id: true, available: true },
        });

        if (!property) {
          throw new AppError("Property not found", 404);
        }

        if (available) {
          const activeRental = await tx.rentalRequest.findFirst({
            where: {
              propertyId: id,
              status: {
                in: [RentalRequestStatus.APPROVED, RentalRequestStatus.ACTIVE],
              },
            },
            select: { id: true },
          });

          if (activeRental) {
            throw new AppError(
              "A property with an approved or active rental cannot be made available",
              409,
            );
          }
        }

        return tx.property.update({
          where: { id },
          data: { available },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async deleteProperty(id: string, landlordId: string) {
    const property = await prisma.property.findFirst({
      where: {
        id,
        landlordId,
      },
    });

    if (!property) {
      throw new Error("Property not found");
    }

    const [rentalCount, reviewCount] = await Promise.all([
      prisma.rentalRequest.count({ where: { propertyId: id } }),
      prisma.review.count({ where: { propertyId: id } }),
    ]);
    if (rentalCount > 0 || reviewCount > 0) {
      throw new AppError("Properties with rental or review history cannot be deleted; mark them unavailable instead", 409);
    }

    return prisma.property.delete({
      where: {
        id,
      },
    });
  }
}

import { Prisma } from "../../../generated/prisma/client";
import prisma from "../../lib/prisma";
import {
  ICreatePropertyPayload,
  IPropertyQuery,
  IUpdatePropertyPayload,
} from "./property.interface";

export class PropertiesService {
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
    // to dos: 1. validate data 2. save to db 3. return response to user
    const { title, location, rent, categoryId, amenities, available } = payload;

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

    const createData = payloads.map((p) => ({
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
    const property = await prisma.property.findFirst({
      where: {
        id,
        landlordId,
      },
    });

    if (!property) {
      throw new Error("Property not found");
    }

    return prisma.property.update({
      where: { id },
      data: payload,
    });
  }
  async updateAvailability(id: string, landlordId: string, available: boolean) {
    const property = await prisma.property.findFirst({
      where: {
        id,
        landlordId,
      },
    });

    if (!property) {
      throw new Error("Property not found");
    }

    return prisma.property.update({
      where: {
        id,
      },
      data: {
        available,
      },
    });
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

    return prisma.property.delete({
      where: {
        id,
      },
    });
  }
}

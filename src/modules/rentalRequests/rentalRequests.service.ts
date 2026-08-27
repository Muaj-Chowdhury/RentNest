import { Prisma } from "../../../generated/prisma/client";
import { Role, RentalRequestStatus } from "../../../generated/prisma/enums";
import prisma from "../../lib/prisma";
import {
  IRentalRequestPayload,
  IRentalRequestQuery,
  RentalRequestStatusField,
} from "./rentalRequests.interface";
type RequestActor = {
  id: string;
  role: Role;
};
export class RentalRequestsService {
  async getAllRequests(
    user: { id: string; role: Role },
    query: IRentalRequestQuery,
  ) {
    const currentPage = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(Math.max(1, query.limit ?? 20), 100);
    const skip = (currentPage - 1) * pageSize;

    const where: Prisma.RentalRequestWhereInput = {};

    if (user.role === Role.TENANT) {
      where.tenantId = user.id;
    } else if (user.role === Role.LANDLORD) {
      where.property = {
        is: {
          landlordId: user.id,
        },
      };
    }

    if (query.status) {
      where.status = query.status;
    }
    const [requests, total] = await Promise.all([
      prisma.rentalRequest.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          propertyId: true,
          tenantId: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          property: {
            select: {
              id: true,
              title: true,
              location: true,
              rent: true,
            },
          },
          tenant: {
            select: {
              id: true,
              name: true,
            },
          },
          payment: {
            select: {
              amount: true,
              status: true,
              provider: true,
            },
          },
        },
      }),
      prisma.rentalRequest.count({ where }),
    ]);

    return {
      requests,
      meta: {
        page: currentPage,
        limit: pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async getRequestById(id: string, actor: RequestActor) {
    if (!id) {
      throw new Error("Request ID is required");
    }
    const roleFilters: Record<Role, Prisma.RentalRequestWhereInput> = {
      [Role.TENANT]: { tenantId: actor.id },
      [Role.LANDLORD]: { property: { landlordId: actor.id } },
      [Role.ADMIN]: {},
    };
    const request = await prisma.rentalRequest.findFirst({
      where: {
        id,
        ...roleFilters[actor.role],
      },
      select: {
        id: true,
        propertyId: true,
        tenantId: true,
        status: true,
        createdAt: true,
        updatedAt: true,

        property: {
          select: {
            id: true,
            title: true,
            location: true,
            rent: true,
            available: true,
            landlord: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },

        tenant: {
          select: {
            id: true,
            name: true,
          },
        },

        payment: {
          select: {
            id: true,
            amount: true,
            provider: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (!request) {
      throw new Error("Rental request not found");
    }

    return request;
  }

  async createRequest(payload: IRentalRequestPayload, tenantId: string) {
    const { propertyId } = payload;
    const property = await prisma.property.findUnique({
      where: {
        id: propertyId,
      },
      select: {
        id: true,
        available: true,
        landlordId: true,
      },
    });

    if (!property) {
      throw new Error("Property not found");
    }

    if (!property.available) {
      throw new Error("Property is not available for rent");
    }
    if (property.landlordId === tenantId) {
      throw new Error("You cannot request your own property");
    }
    const existingRequest = await prisma.rentalRequest.findFirst({
      where: {
        propertyId,
        tenantId,
        status: {
          in: ["PENDING", "APPROVED", "ACTIVE"],
        },
      },
    });
    if (existingRequest) {
      throw new Error(
        "You already have an active request for this property. You cannot request this property",
      );
    }
    return prisma.rentalRequest.create({
      data: {
        propertyId,
        tenantId,
      },
      select: {
        id: true,
        propertyId: true,
        tenantId: true,
        status: true,
        createdAt: true,
      },
    });
  }

  async updateRequestStatus(
    id: string,
    status: RentalRequestStatusField,
    actor: RequestActor,
  ) {
    if (actor.role !== Role.LANDLORD && actor.role !== Role.ADMIN) {
      throw new Error(
        "Unauthorized. Only landlords and admins can update request status",
      );
    }

    return prisma.$transaction(
      async (tx) => {
        const request = await tx.rentalRequest.findUnique({
          where: { id },
          select: {
            status: true,
            propertyId: true,
            property: {
              select: {
                landlordId: true,
              },
            },
          },
        });

        if (!request) {
          throw new Error("Rental request not found");
        }

        if (
          actor.role !== Role.ADMIN &&
          request.property.landlordId !== actor.id
        ) {
          throw new Error("Unauthorized to update this rental request");
        }

        if (request.status !== RentalRequestStatus.PENDING) {
          throw new Error(
            `Cannot update status. Current status is ${request.status}`,
          );
        }

        if (status === RentalRequestStatus.APPROVED) {
          const reservedProperty = await tx.property.updateMany({
            where: {
              id: request.propertyId,
              available: true,
            },
            data: {
              available: false,
            },
          });

          if (reservedProperty.count === 0) {
            throw new Error("Property is no longer available for rent");
          }
        }

        const updatedRequest = await tx.rentalRequest.updateMany({
          where: {
            id,
            status: RentalRequestStatus.PENDING,
          },
          data: {
            status,
            // The payment clock starts at approval. Keeping this separate from
            // updatedAt makes the expiry rule obvious and prevents unrelated
            // edits from extending the tenant's payment reservation.
            approvedAt:
              status === RentalRequestStatus.APPROVED ? new Date() : null,
          },
        });

        if (updatedRequest.count === 0) {
          throw new Error("Only pending requests can be approved or rejected");
        }

        if (status === RentalRequestStatus.APPROVED) {
          await tx.rentalRequest.updateMany({
            where: {
              propertyId: request.propertyId,
              status: RentalRequestStatus.PENDING,
              id: { not: id },
            },
            data: {
              status: RentalRequestStatus.REJECTED,
            },
          });
        }

        return tx.rentalRequest.findUnique({
          where: { id },
          select: {
            id: true,
            propertyId: true,
            tenantId: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            property: {
              select: {
                id: true,
                title: true,
                location: true,
                rent: true,
              },
            },
            tenant: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }
}

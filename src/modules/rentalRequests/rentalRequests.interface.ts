import { RentalRequestStatus } from "../../../generated/prisma/enums";

export interface IRentalRequestPayload {
  propertyId: string;
}

export interface IRentalRequestQuery {
  page?: number;
  limit?: number;
  status?: RentalRequestStatus;
}
export const RentalRequestStatusFields = [
  RentalRequestStatus.APPROVED,
  RentalRequestStatus.REJECTED,
] as const;

export type RentalRequestStatusField = typeof RentalRequestStatusFields[number];

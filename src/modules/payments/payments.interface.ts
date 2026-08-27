export interface ICreatePaymentPayload {
  rentalRequestId: string;
  phone: string;
  address?: string;
  city?: string;
  postcode?: string;
}

export type GatewayPayload = Record<string, unknown>;
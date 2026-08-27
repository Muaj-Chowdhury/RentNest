export interface ICreatePropertyPayload {
  title: string;
  location: string;
  rent: number;
  categoryId: string;
  amenities?: string[];
  available?: boolean;
}
export interface IUpdatePropertyPayload {
  title?: string;
  location?: string;
  rent?: number;
  categoryId?: string;
}
export interface IUpdateAvailabilityPayload {
  available: boolean;
}
export const propertySortFields = [
  "createdAt",
  "rent",
  "title",
] as const;

export type PropertySortField =
  (typeof propertySortFields)[number];

export type PropertySortOrder = "asc" | "desc";
export interface IPropertyQuery {
  search?: string;
  location?: string;

  minRent?: number;
  maxRent?: number;

  categoryId?: string;

  amenities: string[];

  available?: boolean;

  page: number;
  limit: number;

  sortBy: PropertySortField;
  sortOrder: PropertySortOrder;
}
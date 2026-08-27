/**
 * Create category payload
 * model Category {
  id   String @id @default(uuid())
  name String
  properties Property[]
  createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
  @@map("categories")
}
 */
export interface ICreateCategoryPayload {
  name: string
}
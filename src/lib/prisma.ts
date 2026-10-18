/**
 * Prisma ORM Client Configuration
 *
 * Initializes and exports a Prisma client instance with PostgreSQL adapter.
 * This is the primary database client used throughout the application.
 *
 * Configuration:
 * - Adapter: PostgreSQL with @prisma/adapter-pg
 * - Connection String: From environment variables (config.database_url)
 * - Instance: Singleton pattern (single client for entire app)
 */

import { PrismaPg } from "@prisma/adapter-pg";
import config from "../config";
import { PrismaClient } from "../../generated/prisma/client";

// PostgreSQL database connection string from environment
const connectionString = config.database_url;

// Create PostgreSQL adapter for Prisma
const adapter = new PrismaPg({ connectionString });

// Initialize Prisma client with PostgreSQL adapter
const prisma = new PrismaClient({ adapter });

// Export as singleton for application-wide use
export default prisma;

// dotenv configuration

import dotenv from "dotenv";
import path from "path";
dotenv.config({
  path: path.join(process.cwd(), ".env"),
});

export default {
  port: process.env.PORT,
  database_url: process.env.DATABASE_URL,
  app_url: process.env.APP_URL,
  bcrypt_salt_rounds: process.env.BCRYPT_SALT_ROUNDS,
  jwt_access_secret: process.env.JWT_ACCESS_SECRET!,
  jwt_refresh_secret: process.env.JWT_REFRESH_SECRET!,
  jwt_access_expires_in: process.env.JWT_ACCESS_EXPIRES_IN!,
  jwt_refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN!,
  stripe_product_price_id: process.env.STRIPE_PRODUCT_PRICE_ID!,
  stripe_secret_key: process.env.STRIPE_SECRET_KEY!,
  stripe_webhook_secret: process.env.STRIPE_WEBHOOK_SECRET!,
  sslcommerz_env: process.env.SSLCOMMERZ_ENV ?? "sandbox",
  sslcommerz_store_id: process.env.SSLCOMMERZ_STORE_ID!,
  sslcommerz_store_password: process.env.SSLCOMMERZ_STORE_PASSWORD!,
  sslcommerz_request_timeout_ms: Number(
    process.env.SSLCOMMERZ_REQUEST_TIMEOUT_MS ?? 15_000,
  ),
  sslcommerz_uncertain_retry_after_ms: Number(
    process.env.SSLCOMMERZ_UNCERTAIN_RETRY_AFTER_MS ?? 30_000,
  ),
  public_api_url: process.env.PUBLIC_API_URL!,
  // An approved property is reserved for this many minutes while the tenant
  // gets a chance to complete payment. Thirty minutes is a practical sandbox
  // default; production can choose a different value through .env.
  payment_reservation_expiry_minutes: Number(
    process.env.PAYMENT_RESERVATION_EXPIRY_MINUTES ?? 30,
  ),
  // How often the background expiry worker checks for old APPROVED requests.
  payment_reservation_expiry_check_interval_ms: Number(
    process.env.PAYMENT_RESERVATION_EXPIRY_CHECK_INTERVAL_MS ?? 60_000,
  ),
};

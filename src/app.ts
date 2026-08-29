import express, { Request, Response } from "express";
import config from "./config";
import cors from "cors";
import cookieParser from "cookie-parser";
import { globalErrorHandler } from "./middlewares/globalErrorHandler";
import { userRoutes } from "./modules/users/users.routes";
import { adminUserRoutes } from "./modules/users/adminUsers.routes";
import { authRoutes } from "./modules/auth/auth.routes";
import { paymentRoutes } from "./modules/payments/payments.routes";
import { rentalRequestRoutes } from "./modules/rentalRequests/rentalRequests.routes";
import { propertyRoutes } from "./modules/properties/properties.routes";
import { categoryRoutes } from "./modules/categories/categories.routes";
import { reviewRoutes } from "./modules/reviews/reviews.routes";
import { notFound } from "./middlewares/notFound";
const app = express();
app.use(
  cors({
    origin: config.app_url,
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/", (req: Request, res: Response) => {
  res.send("Hello, World!");
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/admin/users", adminUserRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/properties", propertyRoutes);
app.use("/api/rental-requests", rentalRequestRoutes);
app.use("/api/payments", paymentRoutes);

// global error handler (should be last middleware)
app.use(globalErrorHandler);
app.use(notFound);
export default app;

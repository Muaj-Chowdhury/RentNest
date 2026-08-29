import bcrypt from "bcryptjs";
import { Prisma } from "../../../generated/prisma/client";
import { Role, UserStatus } from "../../../generated/prisma/enums";
import config from "../../config";
import { AppError } from "../../errors/AppError";
import prisma from "../../lib/prisma";
import {
  IChangePasswordPayload,
  IUpdateProfilePayload,
} from "./users.interface";

type UserActor = {
  id: string;
  role: Role;
};

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export class UsersService {
  private assertAdmin(actor: UserActor) {
    if (actor.role !== Role.ADMIN) {
      throw new AppError("Only admins can manage users", 403);
    }
  }

  private validateName(value: unknown) {
    if (typeof value !== "string") {
      throw new AppError("Name must be a string", 400);
    }

    const name = value.trim();

    if (name.length < 2 || name.length > 255) {
      throw new AppError("Name must be between 2 and 255 characters", 400);
    }

    return name;
  }

  private validateEmail(value: unknown) {
    if (typeof value !== "string") {
      throw new AppError("Email must be a string", 400);
    }

    const email = value.trim().toLowerCase();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (email.length > 255 || !emailPattern.test(email)) {
      throw new AppError("A valid email is required", 400);
    }

    return email;
  }

  private validatePassword(value: unknown, field: string) {
    if (typeof value !== "string" || value.length < 8 || value.length > 128) {
      throw new AppError(
        `${field} must be between 8 and 128 characters`,
        400,
      );
    }

    return value;
  }

  async getMyProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: publicUserSelect,
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    return user;
  }

  async updateMyProfile(userId: string, payload: IUpdateProfilePayload) {
    if (!payload || typeof payload !== "object") {
      throw new AppError("Invalid profile payload", 400);
    }

    const data: { name?: string; email?: string } = {};
    const payloadKeys = Object.keys(payload);
    const allowedKeys = new Set(["name", "email"]);

    if (payloadKeys.some((key) => !allowedKeys.has(key))) {
      throw new AppError("Only name and email can be updated", 400);
    }

    if (payload.name !== undefined) {
      data.name = this.validateName(payload.name);
    }

    if (payload.email !== undefined) {
      data.email = this.validateEmail(payload.email);
    }

    if (Object.keys(data).length === 0) {
      throw new AppError("At least one profile field is required", 400);
    }

    try {
      return await prisma.user.update({
        where: { id: userId },
        data,
        select: publicUserSelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new AppError("Email is already in use", 409);
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new AppError("User not found", 404);
      }

      throw error;
    }
  }

  async changePassword(userId: string, payload: IChangePasswordPayload) {
    if (!payload || typeof payload !== "object") {
      throw new AppError("Invalid password payload", 400);
    }

    const currentPassword = this.validatePassword(
      payload.currentPassword,
      "currentPassword",
    );
    const newPassword = this.validatePassword(
      payload.newPassword,
      "newPassword",
    );

    if (currentPassword === newPassword) {
      throw new AppError(
        "New password must be different from the current password",
        400,
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    const currentPasswordMatches = await bcrypt.compare(
      currentPassword,
      user.password,
    );

    if (!currentPasswordMatches) {
      throw new AppError("Current password is incorrect", 400);
    }

    const configuredRounds = Number(config.bcrypt_salt_rounds);
    const saltRounds =
      Number.isInteger(configuredRounds) && configuredRounds >= 8
        ? configuredRounds
        : 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return { changed: true };
  }

  async getAllUsers(actor: UserActor, page = 1, limit = 20) {
    this.assertAdmin(actor);

    const currentPage = Math.max(1, page);
    const pageSize = Math.min(Math.max(1, limit), 100);
    const skip = (currentPage - 1) * pageSize;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: pageSize,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: publicUserSelect,
      }),
      prisma.user.count(),
    ]);

    return {
      users,
      meta: {
        page: currentPage,
        limit: pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async getUserById(id: string, actor: UserActor) {
    this.assertAdmin(actor);

    if (!id) {
      throw new AppError("User ID is required", 400);
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    return user;
  }

  async updateUserStatus(id: string, status: UserStatus, actor: UserActor) {
    this.assertAdmin(actor);

    if (!id) {
      throw new AppError("User ID is required", 400);
    }

    if (!Object.values(UserStatus).includes(status)) {
      throw new AppError("Status must be ACTIVE or BANNED", 400);
    }

    if (actor.id === id && status === UserStatus.BANNED) {
      throw new AppError("You cannot ban your own admin account", 400);
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, status: true },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    if (user.role === Role.ADMIN && status === UserStatus.BANNED) {
      const activeAdminCount = await prisma.user.count({
        where: {
          role: Role.ADMIN,
          status: UserStatus.ACTIVE,
        },
      });

      if (activeAdminCount <= 1) {
        throw new AppError("The last active admin cannot be banned", 409);
      }
    }

    return prisma.user.update({
      where: { id },
      data: { status },
      select: publicUserSelect,
    });
  }

  async softDeleteUser(id: string, actor: UserActor) {
    // User records are referenced by rentals and reviews, so hard deletion
    // would destroy marketplace history. DELETE therefore deactivates the
    // account by using the existing BANNED status.
    return this.updateUserStatus(id, UserStatus.BANNED, actor);
  }
}

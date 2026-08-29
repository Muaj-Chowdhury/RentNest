import bcrypt from "bcryptjs";
import prisma from "../../lib/prisma";
import { ILoginUser, RegisterUserPayload } from "./auth.interface";
import { Role } from "../../../generated/prisma/enums";
import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";
import config from "../../config";
import { generateToken } from "../../utils/jwt";
import { AppError } from "../../errors/AppError";
export class AuthService {
  async register(payload: RegisterUserPayload) {
    // Business logic for user registration
    const { name, email, password, role = Role.TENANT } = payload;

    if (role !== Role.TENANT && role !== Role.LANDLORD) {
      throw new Error("Only TENANT or LANDLORD roles can be selected");
    }
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new Error("User already exists");
    }
    const hashedPassword = await bcrypt.hash(password, 10);

    const createUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
      },
    });

    const user = await prisma.user.findUnique({
      where: { id: createUser.id },
      omit: { password: true },
    });

    return user;
  }

  async login(credentials: ILoginUser) {
    // Business logic for user login
    const { email, password } = credentials;
    const user = await prisma.user.findUnique({
      where: { email },
    });
    if (!user) {
      throw new AppError("Invalid email or password", 401);
    }
    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      throw new AppError("Invalid email or password", 401);
    }
    if (user.status !== "ACTIVE") {
      throw new AppError("User account is not active", 403);
    }
    const jwtPayload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    } as JwtPayload;

    const accessToken = generateToken(jwtPayload, config.jwt_access_secret, config.jwt_access_expires_in as SignOptions["expiresIn"]);

    const refreshToken = generateToken(jwtPayload, config.jwt_refresh_secret, config.jwt_refresh_expires_in as SignOptions["expiresIn"]);

return { accessToken, refreshToken };
  }

  async getProfile(userId: string) {
    // Business logic for getting user profile
    const user = await prisma.user.findUnique({
      where: { id: userId },
      omit: { password: true },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    return user;
  }
}

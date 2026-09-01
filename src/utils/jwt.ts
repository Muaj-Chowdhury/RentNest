/**
 * JWT Token Management Utilities
 *
 * Handles token generation and verification for authentication.
 * Supports configurable expiration times and secret keys.
 */

import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";
import config from "../config";

/**
 * Generate a signed JWT token
 *
 * @param payload - The data to encode in the token
 * @param secret - The secret key for signing
 * @param expiresIn - Token expiration time (e.g., '7d', 3600)
 * @returns The signed JWT token string
 */
export const generateToken = (
  payload: JwtPayload,
  secret: string,
  expiresIn: SignOptions["expiresIn"],
) => {
  return jwt.sign(payload, secret, {
    expiresIn,
  } as SignOptions);
};

/**
 * Verify and decode a JWT token
 *
 * @param token - The JWT token to verify
 * @param secret - The secret key for verification
 * @returns Object with success flag and either decoded token or error message
 */
export const verifyToken = (token: string, secret: string) => {
  try {
    const verifiedToken = jwt.verify(token, secret);
    return {
      success: true,
      data: verifiedToken,
    };
  } catch (error: any) {
    // Token verification failed - could be expired or tampered
    console.log("Token verification failed:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

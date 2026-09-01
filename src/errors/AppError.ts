/**
 * Custom Application Error Class
 * 
 * Extends native Error class to include HTTP status codes
 * and additional error details for API responses.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly details: unknown;

  /**
   * Create a new AppError instance
   * 
   * @param message - The error message to display
   * @param statusCode - HTTP status code (default: 500)
   * @param details - Additional error details/metadata (default: empty array)
   */
  constructor(message: string, statusCode = 500, details: unknown = []) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

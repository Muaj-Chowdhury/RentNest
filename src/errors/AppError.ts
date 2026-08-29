export class AppError extends Error {
  readonly statusCode: number;
  readonly details: unknown;

  constructor(message: string, statusCode = 500, details: unknown = []) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

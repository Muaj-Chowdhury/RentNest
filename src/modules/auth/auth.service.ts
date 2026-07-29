export class AuthService {
  async register(data: any) {
    // Business logic for user registration
    return { message: "User registered successfully", data };
  }

  async login(credentials: any) {
    // Business logic for user login
    return { message: "User logged in successfully", token: "mock-jwt-token" };
  }
}

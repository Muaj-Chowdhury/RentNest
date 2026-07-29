export class UsersService {
  async getAllUsers() {
    return [];
  }

  async getUserById(id: string) {
    return { id, name: "John Doe" };
  }

  async updateUser(id: string, data: any) {
    return { id, ...data };
  }

  async deleteUser(id: string) {
    return { id, deleted: true };
  }
}

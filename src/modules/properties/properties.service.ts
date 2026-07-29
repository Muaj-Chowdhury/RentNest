export class PropertiesService {
  async getAllProperties() {
    return [];
  }

  async getPropertyById(id: string) {
    return { id, title: "Sample Property" };
  }

  async createProperty(data: any) {
    return { id: "new-property-id", ...data };
  }

  async updateProperty(id: string, data: any) {
    return { id, ...data };
  }

  async deleteProperty(id: string) {
    return { id, deleted: true };
  }
}

import { Body, Get, Post, Route, Security, Tags } from "tsoa";
import { AdminPropertyService } from "../../services/admin/propertyService";
import { CreatePropertyAdminDto } from "../../dtos/admin/property.dto";

@Route("admin/properties")
@Tags("Admin - Property Management")
@Security("jwt", ["ADMIN"])
export class AdminPropertyController {
  private propertyService = new AdminPropertyService();

  @Post("/")
  public async createProperty(@Body() body: CreatePropertyAdminDto) {
    const property = await this.propertyService.createProperty(body);
    return {
      success: true,
      message: "Property created successfully",
      data: property,
    };
  }

  @Get("/")
  public async getAllProperties() {
    const properties = await this.propertyService.getPropertiesOverview();
    return {
      success: true,
      message: "Properties retrieved successfully",
      data: properties,
    };
  }
}

import { Body, Get, Path, Post, Put, Route, Security, Tags } from "tsoa";
import { AdminPropertyService } from "../../services/admin/propertyService";
import {
  CreatePropertyAdminDto,
  ManageMemberDto,
} from "../../dtos/admin/property.dto";

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

  @Post("{propertyId}/members")
  public async assignMember(
    @Path() propertyId: string,
    @Body() body: ManageMemberDto,
  ) {
    await this.propertyService.assignMember(propertyId, body);
    return {
      success: true,
      message: `${body.role} assigned successfully`,
    };
  }

  @Put("{propertyId}/members/remove")
  public async removeMember(
    @Path() propertyId: string,
    @Body() body: ManageMemberDto,
  ) {
    await this.propertyService.removeMember(propertyId, body);
    return {
      success: true,
      message: `${body.role} removed successfully`,
    };
  }
}

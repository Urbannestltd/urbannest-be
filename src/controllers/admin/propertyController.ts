import { Body, Get, Path, Post, Put, Route, Security, Tags } from "tsoa";
import { AdminPropertyService } from "../../services/admin/propertyService";
import {
  CreatePropertyAdminDto,
  ManageMemberDto,
  UpdatePropertyAdminDto,
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

  // @Get("/")
  // public async getAllProperties() {
  //   const properties = await this.propertyService.getPropertiesOverview();
  //   return {
  //     success: true,
  //     message: "Properties retrieved successfully",
  //     data: properties,
  //   };
  // }

  @Get("{propertyId}")
  public async getPropertyDetails(@Path() propertyId: string) {
    const propertyDetails =
      await this.propertyService.getPropertyDetailsOverview(propertyId);
    return {
      success: true,
      message: "Property details retrieved successfully",
      data: propertyDetails,
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

  @Put("{propertyId}")
  public async updateProperty(
    @Path() propertyId: string,
    @Body() body: UpdatePropertyAdminDto,
  ) {
    const updatedProperty = await this.propertyService.updateProperty(
      propertyId,
      body,
    );
    return {
      success: true,
      message: "Property updated successfully",
      data: updatedProperty,
    };
  }
}

import { Body, Delete, Get, Path, Post, Route, Security, Tags } from "tsoa";
import { AdminUnitService } from "../../services/admin/unitService";
import { CreateUnitAdminDto } from "../../dtos/admin/property.dto";

@Route("admin/units")
@Tags("Admin - Property Units")
@Security("jwt", ["ADMIN"])
export class AdminUnitController {
  private unitService = new AdminUnitService();

  @Post("{propertyId}/units")
  public async addUnit(
    @Path() propertyId: string,
    @Body() body: CreateUnitAdminDto,
  ) {
    const unit = await this.unitService.addUnit(propertyId, body);
    return {
      success: true,
      message: "Unit added successfully",
      data: unit,
    };
  }

  @Get("{propertyId}/units")
  public async getPropertyUnits(@Path() propertyId: string) {
    const unitData = await this.unitService.getUnitsByProperty(propertyId);
    return {
      success: true,
      message: "Units retrieved successfully",
      data: unitData,
    };
  }

  @Delete("{unitId}")
  public async deleteUnit(@Path() unitId: string) {
    await this.unitService.deleteUnit(unitId);
    return { success: true, message: "Unit deleted successfully" };
  }

  @Get("{tenantId}")
  public async getTenantProfile(@Path() tenantId: string) {
    const profile = await this.unitService.getTenantProfile(tenantId);
    return {
      success: true,
      message: "Tenant profile retrieved successfully",
      data: profile,
    };
  }
}

import { Body, Delete, Get, Middlewares, Patch, Path, Post, Route, Security, Tags } from "tsoa";
import { AdminUnitService } from "../../services/admin/unitService";
import { CreateUnitAdminDto, UpdateUnitAdminDto } from "../../dtos/admin/property.dto";
import { Permission } from "@prisma/client";
import { requirePermission } from "../../middlewares/permissionMiddleware";

@Route("admin/units")
@Tags("Admin - Property Units")
@Security("jwt")
@Middlewares(requirePermission(Permission.MANAGE_PROPERTIES_AND_UNITS))
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

  @Patch("{unitId}")
  public async updateUnit(
    @Path() unitId: string,
    @Body() body: UpdateUnitAdminDto,
  ) {
    const unit = await this.unitService.updateUnit(unitId, body);
    return { success: true, message: "Unit updated successfully", data: unit };
  }

  @Delete("{unitId}")
  public async deleteUnit(@Path() unitId: string) {
    await this.unitService.deleteUnit(unitId);
    return { success: true, message: "Unit deleted successfully" };
  }

  @Get("unit/{unitId}")
  public async getUnitById(@Path() unitId: string) {
    const unit = await this.unitService.getUnitById(unitId);
    return {
      success: true,
      message: "Unit retrieved successfully",
      data: unit,
    };
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

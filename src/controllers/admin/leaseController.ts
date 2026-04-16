import { Body, Patch, Path, Post, Route, Security, Tags } from "tsoa";
import { AdminLeaseService } from "../../services/admin/leaseService";
import {
  CreateLeaseDto,
  UpdateLeaseDto,
  RenewLeaseDto,
} from "../../dtos/admin/lease.dto";

@Route("admin/leases")
@Tags("Admin - Leases")
@Security("jwt", ["ADMIN"])
export class AdminLeaseController {
  private leaseService = new AdminLeaseService();

  @Post("/")
  public async createTenantLease(@Body() body: CreateLeaseDto) {
    const lease = await this.leaseService.createLease(body);
    return {
      success: true,
      message: "Lease created and unit occupied successfully",
      data: lease,
    };
  }

  @Patch("{leaseId}")
  public async updateLease(
    @Path() leaseId: string,
    @Body() body: UpdateLeaseDto,
  ) {
    const lease = await this.leaseService.updateLease(leaseId, body);
    return { success: true, message: "Lease updated successfully", data: lease };
  }

  @Post("{leaseId}/renew")
  public async renewLease(
    @Path() leaseId: string,
    @Body() body: RenewLeaseDto,
  ) {
    const lease = await this.leaseService.renewLease(leaseId, body);
    return {
      success: true,
      message: "Lease renewed successfully",
      data: lease,
    };
  }
}

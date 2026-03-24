import { Body, Post, Route, Security, Tags } from "tsoa";
import { AdminLeaseService } from "../../services/admin/leaseService";
import { CreateLeaseDto } from "../../dtos/admin/lease.dto";

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
}

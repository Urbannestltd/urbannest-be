import { Get, Path, Query, Route, Controller, Tags, Security, Request } from "tsoa";
import { LandlordTenantsService } from "../../services/landlord/landlordTenantsService";
import {
  LandlordTenantsQuerySchema,
  type LandlordTenantItem,
  type LandlordTenantDetail,
} from "../../dtos/landlord/landlord.tenants.dto";
import { validate } from "../../utils/validate";

@Route("landlord/tenants")
@Tags("Landlord - Tenants")
@Security("jwt", ["LANDLORD"])
export class LandlordTenantsController extends Controller {
  private service = new LandlordTenantsService();

  /**
   * Returns all tenants (active leases) for the landlord's properties.
   * Each item includes: leaseId, tenantId, tenantName, tenantEmail, tenantPhone,
   * propertyId, propertyName, unitId, unitName, leaseStatus, rentAmount, lease dates.
   *
   * Filters:
   *  - propertyId: limit to a specific property
   *  - search: partial match on tenant name, email, unit name, or property name
   *  - status: ACTIVE | EXPIRED | TERMINATED
   *
   * Sort options (sortBy):
   *  - name_asc / name_desc — alphabetical by tenant name
   *  - status_asc / status_desc — by lease status
   *  - startDate_asc / startDate_desc — by lease start date
   *
   * Returns an empty array if no leases found.
   */
  @Get()
  public async getTenants(
    @Request() req: any,
    @Query() propertyId?: string,
    @Query() search?: string,
    @Query() status?: string,
    @Query() sortBy?: string,
  ): Promise<{ success: boolean; data: LandlordTenantItem[] }> {
    const query = validate(LandlordTenantsQuerySchema, {
      propertyId,
      search,
      status,
      sortBy,
    });
    const data = await this.service.getTenants(req.user.userId, query);
    return { success: true, data };
  }

  /**
   * Returns detailed information for a specific tenant.
   * Includes all of their leases for your properties, with lease terms and rent amounts.
   * Returns 403 if the tenant has no leases with your properties.
   */
  @Get("{tenantId}")
  public async getTenantDetail(
    @Path() tenantId: string,
    @Request() req: any,
  ): Promise<{ success: boolean; data: LandlordTenantDetail }> {
    const data = await this.service.getTenantDetail(req.user.userId, tenantId);
    return { success: true, data };
  }
}

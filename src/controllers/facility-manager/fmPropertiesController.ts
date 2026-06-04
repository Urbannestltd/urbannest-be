import {
  Get,
  Path,
  Query,
  Route,
  Controller,
  Tags,
  Security,
  Request,
} from "tsoa";
import { FmPropertiesService } from "../../services/facility-manager/fmPropertiesService";
import {
  GetPropertiesQuerySchema,
  GetTenantProfileQuerySchema,
} from "../../dtos/facility-manager/fm.properties.dto";
import { validate } from "../../utils/validate";

@Route("facility-manager/properties")
@Tags("FM - Properties")
@Security("jwt", ["FACILITY_MANAGER"])
export class FmPropertiesController extends Controller {
  private fmPropertiesService = new FmPropertiesService();

  /**
   * Returns all properties assigned to the requesting FM.
   * Sorted alphabetically by name.
   *
   * Filters:
   *  - search: matches property name or address
   *  - type: "RESIDENTIAL" | "COMMERCIAL"
   *  - occupancy: "0-20" | "21-40" | "41-60" | "61-80" | "81-100" (% range)
   *  - unitRange: "1-10" | "11-20" | ... | "141-150"
   */
  @Get()
  public async getAssignedProperties(
    @Request() req: any,
    @Query() search?: string,
    @Query() type?: string,
    @Query() occupancy?: string,
    @Query() unitRange?: string,
  ) {
    const filters = validate(GetPropertiesQuerySchema, { search, type, occupancy, unitRange });
    const data = await this.fmPropertiesService.getAssignedProperties(req.user.userId, filters);
    return { success: true, message: "Properties retrieved", data };
  }

  /**
   * Returns full property details for a single assigned property.
   * Returns 403 if the FM's access has been revoked — the frontend should redirect to the
   * property list and show: "You no longer have access to this property."
   */
  @Get("{propertyId}")
  public async getPropertyDetail(
    @Path() propertyId: string,
    @Request() req: any,
  ) {
    const data = await this.fmPropertiesService.getPropertyDetail(
      req.user.userId,
      propertyId,
    );
    return { success: true, message: "Property detail retrieved", data };
  }

  /**
   * Returns the units list for a property with tenant and complaint data.
   * Returns 403 if FM access has been revoked.
   */
  @Get("{propertyId}/units")
  public async getPropertyUnits(
    @Path() propertyId: string,
    @Request() req: any,
    @Query() search?: string,
  ) {
    const data = await this.fmPropertiesService.getPropertyUnits(
      req.user.userId,
      propertyId,
      search,
    );
    return { success: true, message: "Units retrieved", data };
  }

  /**
   * Returns the full tenant profile (general info, lease, visitor history, payment history, cohabitants).
   * Optional filter: ?visitorPeriod=today|last_week|last_month
   * Returns 403 if FM access has been revoked, 404 if tenant does not belong to this property.
   */
  @Get("{propertyId}/tenants/{tenantId}")
  public async getTenantProfile(
    @Path() propertyId: string,
    @Path() tenantId: string,
    @Request() req: any,
    @Query() visitorPeriod?: string,
  ) {
    const { visitorPeriod: period } = validate(GetTenantProfileQuerySchema, { visitorPeriod });
    const data = await this.fmPropertiesService.getTenantProfile(
      req.user.userId,
      propertyId,
      tenantId,
      period,
    );
    return { success: true, message: "Tenant profile retrieved", data };
  }
}

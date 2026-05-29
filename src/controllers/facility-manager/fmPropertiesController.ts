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
import { BadRequestError } from "../../utils/apiError";

const VALID_OCCUPANCY = ["VACANT", "PARTIAL", "OCCUPIED"] as const;
type OccupancyFilter = (typeof VALID_OCCUPANCY)[number];

@Route("facility-manager/properties")
@Tags("Facility Manager")
@Security("jwt", ["FACILITY_MANAGER"])
export class FmPropertiesController extends Controller {
  private fmPropertiesService = new FmPropertiesService();

  /**
   * Returns all properties assigned to the requesting FM.
   * Sorted alphabetically by name. Supports search, type, and occupancy filters.
   */
  @Get()
  public async getAssignedProperties(
    @Request() req: any,
    @Query() search?: string,
    @Query() type?: string,
    @Query() occupancy?: string,
  ) {
    if (occupancy && !VALID_OCCUPANCY.includes(occupancy as OccupancyFilter)) {
      throw new BadRequestError(
        `Invalid occupancy filter. Must be one of: ${VALID_OCCUPANCY.join(", ")}`,
      );
    }

    const data = await this.fmPropertiesService.getAssignedProperties(
      req.user.userId,
      {
        search,
        type,
        occupancy: occupancy as OccupancyFilter | undefined,
      },
    );
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
   * Returns 403 if FM access has been revoked, 404 if tenant does not belong to this property.
   */
  @Get("{propertyId}/tenants/{tenantId}")
  public async getTenantProfile(
    @Path() propertyId: string,
    @Path() tenantId: string,
    @Request() req: any,
  ) {
    const data = await this.fmPropertiesService.getTenantProfile(
      req.user.userId,
      propertyId,
      tenantId,
    );
    return { success: true, message: "Tenant profile retrieved", data };
  }
}

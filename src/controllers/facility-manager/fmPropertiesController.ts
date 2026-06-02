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

const VALID_TYPES = ["RESIDENTIAL", "COMMERCIAL"] as const;
const VALID_OCCUPANCY_RANGES = ["0-20", "21-40", "41-60", "61-80", "81-100"] as const;
type OccupancyRange = (typeof VALID_OCCUPANCY_RANGES)[number];

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
    if (type && !VALID_TYPES.includes(type as any)) {
      throw new BadRequestError(
        `Invalid type filter. Must be one of: ${VALID_TYPES.join(", ")}`,
      );
    }
    if (occupancy && !VALID_OCCUPANCY_RANGES.includes(occupancy as OccupancyRange)) {
      throw new BadRequestError(
        `Invalid occupancy filter. Must be one of: ${VALID_OCCUPANCY_RANGES.join(", ")}`,
      );
    }

    const data = await this.fmPropertiesService.getAssignedProperties(
      req.user.userId,
      {
        search,
        type,
        occupancy: occupancy as OccupancyRange | undefined,
        unitRange,
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

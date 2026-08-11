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
import { FdPropertiesService } from "../../services/front-desk/fdPropertiesService";
import { GetPropertiesQuerySchema } from "../../dtos/facility-manager/fm.properties.dto";
import { validate } from "../../utils/validate";

@Route("front-desk/properties")
@Tags("FD - Properties")
@Security("jwt", ["FRONT_DESK"])
export class FdPropertiesController extends Controller {
  private fdPropertiesService = new FdPropertiesService();

  /**
   * Returns all properties assigned to the requesting FD.
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
    const data = await this.fdPropertiesService.getAssignedProperties(req.user.userId, filters);
    return { success: true, message: "Properties retrieved", data };
  }

  /**
   * Returns the units list for a property with tenant and complaint data.
   * Returns 403 if FD access has been revoked.
   */
  @Get("{propertyId}/units")
  public async getPropertyUnits(
    @Path() propertyId: string,
    @Request() req: any,
    @Query() search?: string,
  ) {
    const data = await this.fdPropertiesService.getPropertyUnits(
      req.user.userId,
      propertyId,
      search,
    );
    return { success: true, message: "Units retrieved", data };
  }
}

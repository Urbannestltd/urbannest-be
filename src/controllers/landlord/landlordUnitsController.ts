import { Get, Query, Route, Controller, Tags, Security, Request } from "tsoa";
import { LandlordUnitsService } from "../../services/landlord/landlordUnitsService";
import {
  LandlordUnitsQuerySchema,
  type LandlordUnitItem,
} from "../../dtos/landlord/landlord.units.dto";
import { validate } from "../../utils/validate";

@Route("landlord/units")
@Tags("Landlord - Units")
@Security("jwt", ["LANDLORD"])
export class LandlordUnitsController extends Controller {
  private service = new LandlordUnitsService();

  /**
   * Returns all units belonging to the landlord's properties.
   * Each item includes: id, propertyId, propertyName, unitName, floor (normalized), status, baseRent, tenantId, tenantName,
   * complaintsPercentage, leaseExpiryPercentage, members, and lease dates.
   * Floor names are normalized (e.g., "7", "Floor 7", "Seventh Floor" → "Floor 7").
   *
   * Filters:
   *  - propertyId: limit to a specific property
   *  - unitId: get a specific unit
   *  - search: partial match on unit name or property name
   *  - status: AVAILABLE | OCCUPIED | MAINTENANCE
   *
   * Sort options (sortBy):
   *  - name_asc / name_desc — alphabetical by unit name
   *  - status_asc / status_desc — by unit status
   *
   * Returns an empty array if no units found.
   */
  @Get()
  public async getUnits(
    @Request() req: any,
    @Query() propertyId?: string,
    @Query() unitId?: string,
    @Query() search?: string,
    @Query() status?: string,
    @Query() sortBy?: string,
  ): Promise<{ success: boolean; data: LandlordUnitItem }> {
    const query = validate(LandlordUnitsQuerySchema, {
      propertyId,
      unitId,
      search,
      status,
      sortBy,
    });
    const data = await this.service.getUnits(req.user.userId, query);
    return { success: true, data };
  }
}

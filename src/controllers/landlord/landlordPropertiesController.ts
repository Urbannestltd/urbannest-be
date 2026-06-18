import { Get, Path, Query, Route, Controller, Tags, Security, Request } from "tsoa";
import { LandlordPropertiesService } from "../../services/landlord/landlordPropertiesService";
import {
  LandlordPropertiesQuerySchema,
  type LandlordPropertyItem,
} from "../../dtos/landlord/landlord.properties.dto";
import type { PropertyDetailsResponseDto } from "../../dtos/admin/property.dto";
import { validate } from "../../utils/validate";

@Route("landlord/properties")
@Tags("Landlord - Properties")
@Security("jwt", ["LANDLORD"])
export class LandlordPropertiesController extends Controller {
  private service = new LandlordPropertiesService();

  /**
   * Returns all properties assigned to the landlord.
   * Each item includes: id, name, type, address, city, state, totalUnits, occupancyRate.
   *
   * Filters:
   *  - search: partial match on property name, address, or city
   *  - type: MULTI_UNIT | SINGLE_FAMILY | COMMERCIAL | RESIDENTIAL
   *  - minUnits / maxUnits: filter by total unit count range
   *
   * Sort options (sortBy):
   *  - name_asc / name_desc — alphabetical
   *  - occupancy_asc / occupancy_desc — by occupancy percentage
   *  - units_asc / units_desc — by total unit count
   *
   * Returns an empty array for landlords with no assigned properties.
   */
  @Get()
  public async getProperties(
    @Request() req: any,
    @Query() search?: string,
    @Query() type?: string,
    @Query() minUnits?: number,
    @Query() maxUnits?: number,
    @Query() sortBy?: string,
  ): Promise<{ success: boolean; data: LandlordPropertyItem[] }> {
    const query = validate(LandlordPropertiesQuerySchema, {
      search,
      type,
      minUnits,
      maxUnits,
      sortBy,
    });
    const data = await this.service.getProperties(req.user.userId, query);
    return { success: true, data };
  }

  /**
   * Returns the full detail view for a single property owned by the landlord.
   * Mirrors the FM and admin property detail view — includes amenities, images,
   * people cards (FM, agent), unit stats, complaints percentage, and the
   * monthly rental revenue chart for the current year.
   * Returns 403 if the property exists but is not assigned to this landlord.
   */
  @Get("{propertyId}")
  public async getPropertyDetail(
    @Path() propertyId: string,
    @Request() req: any,
  ): Promise<{ success: boolean; data: PropertyDetailsResponseDto }> {
    const data = await this.service.getPropertyDetail(req.user.userId, propertyId);
    return { success: true, data };
  }
}

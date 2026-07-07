import { Get, Path, Query, Route, Controller, Tags, Security, Request } from "tsoa";
import { AgentPropertyDetailService } from "../../services/agent/agentPropertyDetailService";
import { MediaDownloadQuerySchema } from "../../dtos/agent/agent.property-detail.dto";
import { validate } from "../../utils/validate";

@Route("agent/properties")
@Tags("Agent - Properties")
@Security("jwt", ["AGENT"])
export class AgentPropertyDetailController extends Controller {
  private service = new AgentPropertyDetailService();

  /**
   * Returns full detail for a single property assigned to the logged-in agent:
   * summary metrics (rent, unit count, floor count), last updated date, media, and amenities.
   * Returns 403 if the agent is not (or no longer) assigned to this property.
   */
  @Get("{propertyId}")
  public async getPropertyDetail(
    @Path() propertyId: string,
    @Request() req: any,
  ) {
    const data = await this.service.getPropertyDetail(req.user.userId, propertyId);
    return { success: true, message: "Property detail retrieved", data };
  }

  /**
   * Validates the agent's current assignment to the property and the requested media
   * belongs to it, logs the download, and returns the asset URL.
   * Returns 403 if the agent is not (or no longer) assigned to this property.
   */
  @Get("{propertyId}/media/download")
  public async downloadMedia(
    @Path() propertyId: string,
    @Query() url: string,
    @Request() req: any,
  ) {
    const { url: validatedUrl } = validate(MediaDownloadQuerySchema, { url });
    const data = await this.service.getMediaDownloadUrl(req.user.userId, propertyId, validatedUrl);
    return { success: true, message: "Download link generated", data };
  }
}

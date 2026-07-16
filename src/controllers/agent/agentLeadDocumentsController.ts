import {
  Body,
  Delete,
  Get,
  Post,
  Path,
  Route,
  Controller,
  Tags,
  Security,
  Request,
  SuccessResponse,
} from "tsoa";
import { AgentLeadsService } from "../../services/agent/agentLeadsService";
import {
  UploadDocumentsSchema,
  type UploadDocumentsRequest,
} from "../../dtos/agent/agent.lead-documents.dto";
import { validate } from "../../utils/validate";

@Route("agent/lead-documents")
@Tags("Agent - Leads")
@Security("jwt", ["AGENT"])
export class AgentLeadDocumentsController extends Controller {
  private service = new AgentLeadsService();

  /**
   * Uploads one or more documents with no lead attached yet (staged).
   * Useful for collecting documents before a lead is created — attach them
   * later via PATCH agent/leads/{leadId}/documents/attach.
   */
  @SuccessResponse(201, "Documents staged")
  @Post()
  public async uploadUnattachedDocuments(
    @Request() req: any,
    @Body() body: UploadDocumentsRequest,
  ) {
    const { documents } = validate(UploadDocumentsSchema, body);
    const result = await this.service.uploadUnattachedDocuments(req.user.userId, documents);
    this.setStatus(201);
    return { success: true, message: "Documents staged", data: result };
  }

  /**
   * Lists this agent's staged (unattached) documents — not yet linked to any lead.
   */
  @Get()
  public async getUnattachedDocuments(@Request() req: any) {
    const data = await this.service.getUnattachedDocuments(req.user.userId);
    return { success: true, message: "Unattached documents retrieved", data };
  }

  /**
   * Deletes one of this agent's staged (unattached) documents.
   * Returns 409 if the document is already attached to a lead — delete it
   * from that lead instead (DELETE agent/leads/{leadId}/documents/{documentId}).
   */
  @Delete("{documentId}")
  public async deleteUnattachedDocument(
    @Path() documentId: string,
    @Request() req: any,
  ) {
    await this.service.deleteUnattachedDocument(req.user.userId, documentId);
    return { success: true, message: "Document deleted" };
  }
}

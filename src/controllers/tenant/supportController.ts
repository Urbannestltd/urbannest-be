import {
  Controller,
  Post,
  Get,
  Body,
  Route,
  Tags,
  Security,
  Request,
  Path,
} from "tsoa";
import { SupportService } from "../../services/tenant/supportService";
import {
  CreateSupportSchema,
  AddSupportMessageSchema,
  CreateSupportRequest,
  AddSupportMessageRequest,
} from "../../dtos/tenant/support.dto";
import { successResponse } from "../../utils/responseHelper";
import { validate } from "../../utils/validate";

@Route("support")
@Tags("Support Tickets")
export class SupportController extends Controller {
  private supportService = new SupportService();

  @Post("create")
  @Security("jwt")
  public async create(@Request() req: any, @Body() body: CreateSupportRequest) {
    validate(CreateSupportSchema, body);
    const result = await this.supportService.createTicket(
      req.user.userId,
      body,
    );
    return successResponse(result, "Support ticket created");
  }

  @Post("{id}/reply")
  @Security("jwt")
  public async reply(
    @Request() req: any,
    @Path() id: string,
    @Body() body: AddSupportMessageRequest,
  ) {
    validate(AddSupportMessageSchema, body);
    const result = await this.supportService.replyToTicket(
      id,
      req.user.userId,
      body,
    );
    return successResponse(result, "Reply sent");
  }

  @Get("{id}")
  @Security("jwt")
  public async getDetails(@Path() id: string) {
    const result = await this.supportService.getTicketDetails(id);
    return successResponse(result, "Ticket details retrieved");
  }
}

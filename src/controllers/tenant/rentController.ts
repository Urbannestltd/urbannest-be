import {
  Controller,
  Post,
  Get,
  Body,
  Route,
  Tags,
  Security,
  Request,
} from "tsoa";
import { RentService } from "../../services/tenant/rentService";
import {
  InitiateRentRequest,
  InitiateRentSchema,
} from "../../dtos/tenant/rent.dto";
import { successResponse } from "../../utils/responseHelper";
import { validate } from "../../utils/validate"; // Wrapper around Zod parse

@Route("rent")
@Tags("Rent Management")
export class RentController extends Controller {
  private rentService = new RentService();

  /**
   * Initiate Rent Payment
   * Handles both "New Move-In" and "Rent Renewal".
   */
  @Post("pay")
  @Security("jwt")
  public async payRent(@Request() req: any, @Body() body: InitiateRentRequest) {
    // 1. Validate Input
    validate(InitiateRentSchema, body);
    const userId = req.user.userId;

    // 2. Call Service
    const result = await this.rentService.initiateRent(userId, body);

    // 3. Return Paystack URL
    return successResponse(
      result,
      "Rent payment initialized. Redirect to URL.",
    );
  }

  /**
   * Get Rent History
   */
  @Get("history")
  @Security("jwt")
  public async getHistory(@Request() req: any) {
    const userId = req.user.userId;
    const history = await this.rentService.getRentHistory(userId);
    return successResponse(history);
  }
}

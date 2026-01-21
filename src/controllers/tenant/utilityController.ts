import {
  Controller,
  Post,
  Body,
  Route,
  Tags,
  Security,
  Request,
  Get,
  Delete,
  Path,
} from "tsoa";
import { UtilityService } from "../../services/tenant/utilityService";
import {
  VerifyMeterSchema,
  PurchaseUtilitySchema,
} from "../../dtos/tenant/utility.dto";
import { successResponse } from "../../utils/responseHelper";
import { validate } from "../../utils/validate";

@Route("utilities")
@Tags("Utility Bills & Vending")
export class UtilityController extends Controller {
  private utilityService = new UtilityService();

  /**
   * Step 1: Verify Meter Number
   * User enters "123456789", we return "John Doe".
   */
  @Post("verify-meter")
  @Security("jwt")
  public async verifyMeter(
    @Body() body: { serviceID: string; meterNumber: string; type?: string },
  ) {
    validate(VerifyMeterSchema, body);
    const result = await this.utilityService.verifyMeter(
      body.serviceID,
      body.meterNumber,
      body.type,
    );
    return successResponse(result, "Meter verified");
  }

  /**
   * Step 2: Buy Electricity / Pay Bill
   * User confirms Amount -> Redirects to Paystack.
   */
  @Post("purchase")
  @Security("jwt")
  public async purchaseUtility(@Request() req: any, @Body() body: any) {
    validate(PurchaseUtilitySchema, body);
    const result = await this.utilityService.initiatePurchase(
      req.user.userId,
      body,
    );
    return successResponse(result, "Payment initialized");
  }
  @Get("saved-meters")
  @Security("jwt")
  public async getSavedMeters(@Request() req: any) {
    const userId = req.user.userId;
    const meters = await this.utilityService.getSavedMeters(userId);
    return successResponse(meters, "Saved meters retrieved");
  }

  /**
   * Delete a saved meter profile.
   */
  @Delete("saved-meters/{id}")
  @Security("jwt")
  public async deleteMeter(@Request() req: any, @Path() id: string) {
    const userId = req.user.userId;
    await this.utilityService.deleteSavedMeter(userId, id);
    return successResponse(null, "Meter profile deleted");
  }
}

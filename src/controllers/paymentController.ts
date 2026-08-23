import { Controller, Post, Body, Route, Tags, Security, Request } from "tsoa";
import { PaymentService } from "../services/paymentService";
import { successResponse } from "../utils/responseHelper";
import { BadRequestError } from "../utils/apiError";

@Route("payments")
@Tags("Payment Gateway")
export class PaymentController extends Controller {
  private paymentService = new PaymentService();

  /**
   * Verify Payment
   * Called by Frontend after Paystack redirect.
   * Universal endpoint for Rent, Utilities, etc. — available to any
   * authenticated user, regardless of role. The reference is scoped to the
   * caller's own userId server-side (see PaymentService.verifyPayment), so
   * no per-role restriction is needed here.
   */
  @Post("verify")
  @Security("jwt")
  public async verify(@Request() req: any, @Body() body: { reference: string }) {
    if (!body.reference) throw new BadRequestError("Reference is required");

    const result = await this.paymentService.verifyPayment(body.reference, req.user.userId);
    return successResponse(result, "Payment verified successfully");
  }
}

import { Controller, Post, Body, Route, Tags, Security } from "tsoa";
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
   * Universal endpoint for Rent, Utilities, etc.
   */
  @Post("verify")
  @Security("jwt")
  public async verify(@Body() body: { reference: string }) {
    if (!body.reference) throw new BadRequestError("Reference is required");

    const result = await this.paymentService.verifyPayment(body.reference);
    return successResponse(result, "Payment verified successfully");
  }
}

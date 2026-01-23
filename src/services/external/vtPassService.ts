import axios from "axios";
import { BadRequestError } from "../../utils/apiError";

export class VTPassService {
  private client;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.VTPASS_BASE_URL || "https://sandbox.vtpass.com/api",
      headers: {
        // VTPass typically uses Basic Auth or specific headers. Check their docs.
        "api-key": process.env.VTPASS_API_KEY,
        "secret-key": process.env.VTPASS_SECRET_KEY,
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * Step 1: Verify Customer (The "Who is this?" check)
   */
  public async verifyMerchant(
    serviceID: string,
    billersCode: string,
    type?: string,
  ) {
    try {
      const response = await this.client.post("/merchant-verify", {
        serviceID,
        billersCode,
        type,
      });

      // 1. Check for General Failure (Code not 000)
      if (response.data.code !== "000") {
        throw new Error(
          response.data.response_description || "Invalid Meter Number",
        );
      }

      // 2. Check for Specific "Wrong Biller" Failure
      // Use ?. to safely access content in case it's missing
      if (response.data.content?.WrongBillersCode) {
        throw new Error(
          `Invalid Meter Number, or this meter does not belong to ${serviceID}`,
        );
      }

      return {
        customerName: response.data.content.Customer_Name,
        address: response.data.content.Address,
        valid: true,
      };
    } catch (error: any) {
      // Log full details for the developer
      console.error(
        "VTPass Verify Error:",
        error.response?.data || error.message,
      );

      // EXTRACT THE SPECIFIC MESSAGE
      // Priority 1: The error description returned directly by VTPass API (if request failed with 400/500)
      // Priority 2: The manual error message we threw above (e.g. "Invalid Meter Number...")
      // Priority 3: A generic fallback
      const message =
        error.response?.data?.response_description ||
        error.message ||
        "Could not verify meter number.";

      // Throw the specific message to the controller
      throw new BadRequestError(message);
    }
  }

  /**
   * Step 3: Purchase Product (The "Give me the Token" check)
   */
  public async purchaseProduct(
    requestId: string,
    serviceID: string,
    billersCode: string,
    variation_code: string,
    amount: number,
    phone: string,
  ) {
    try {
      const response = await this.client.post("/pay", {
        request_id: requestId, // Unique ID for VTPass to prevent double charging
        serviceID,
        billersCode,
        amount,
        variation_code,
        phone, // Customer phone number
      });

      if (response.data.code !== "000") {
        // Vending Failed! But money was likely taken by Paystack.
        // In a real app, you would log this to a "Failed Vends" table for manual refund/retry.
        throw new Error(response.data.response_description || "Vending failed");
      }

      // Extract Token (Different services return it differently)
      const token =
        response.data.mainToken ||
        response.data.purchased_code ||
        response.data.token;

      return {
        success: true,
        token: token,
        transactionId: response.data.content?.transactions?.transactionId,
      };
    } catch (error: any) {
      console.error(
        "VTPass Purchase Error:",
        error.response?.data || error.message,
      );
      throw new BadRequestError(
        "Vending service failed. Please contact support.",
      );
    }
  }
}

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
      // VTPass endpoint to verify meter/smartcard
      const response = await this.client.post("/merchant-verify", {
        serviceID, // e.g. "ikeja-electric-prepaid"
        billersCode, // The Meter Number
        type, // Optional: Some services need "prepaid" vs "postpaid"
      });

      if (response.data.code !== "000") {
        throw new Error(
          response.data.response_description || "Invalid Meter Number",
        );
      }

      // Return the Customer Name (e.g., "John Doe")
      return {
        customerName: response.data.content.Customer_Name,
        address: response.data.content.Address,
        valid: true,
      };
    } catch (error: any) {
      console.error(
        "VTPass Verify Error:",
        error.response?.data || error.message,
      );
      throw new BadRequestError("Could not verify meter number.");
    }
  }

  /**
   * Step 3: Purchase Product (The "Give me the Token" check)
   */
  public async purchaseProduct(
    requestId: string,
    serviceID: string,
    billersCode: string,
    amount: number,
    phone: string,
  ) {
    try {
      const response = await this.client.post("/pay", {
        request_id: requestId, // Unique ID for VTPass to prevent double charging
        serviceID,
        billersCode,
        amount,
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

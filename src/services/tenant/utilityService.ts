import { prisma } from "../../config/prisma";
import { paystackClient } from "../../utils/paystackClient";
import { VTPassService } from "../external/vtPassService";
import { PurchaseUtilityRequest } from "../../dtos/tenant/utility.dto";
import {
  PaymentStatus,
  PaymentType,
  UtilityType,
  utilityProfile,
} from "@prisma/client";
import { BadRequestError, NotFoundError } from "../../utils/apiError";

export class UtilityService {
  private vtpass = new VTPassService();

  /**
   * Helper: Map VTPass Service ID to our Enum
   */
  private mapServiceToEnum(serviceID: string): UtilityType {
    if (serviceID.includes("electric")) return UtilityType.ELECTRICITY;
    if (serviceID.includes("water")) return UtilityType.WATER;
    if (serviceID.includes("waste")) return UtilityType.WASTE;
    return UtilityType.SERVICE_CHARGE; // Default/Fallback
  }

  // 1. VERIFY METER (Passthrough)
  public async verifyMeter(serviceID: string, meterNo: string, type?: string) {
    return this.vtpass.verifyMerchant(serviceID, meterNo, type);
  }

  // 2. INITIATE PURCHASE
  public async initiatePurchase(
    userId: string,
    params: PurchaseUtilityRequest,
  ) {
    const user = await prisma.user.findUnique({ where: { userId: userId } });
    if (!user) throw new BadRequestError("User not found");

    // A. Validate with VTPass one last time (Safety Check)
    // Optional: Skipping to save API calls, but recommended in high-risk apps

    // B. Save Meter Profile if requested
    if (params.saveMeter) {
      // Check if already saved
      const existing = await prisma.utilityProfile.findFirst({
        where: { userId, identifier: params.meterNumber },
      });

      if (!existing) {
        await prisma.utilityProfile.create({
          data: {
            userId,
            type: this.mapServiceToEnum(params.serviceID),
            provider: params.serviceID,
            identifier: params.meterNumber,
            label: params.label || `${params.serviceID} Meter`,
          },
        });
      }
    }

    // C. Initialize Paystack
    const reference = `UTIL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Metadata is KEY here. We need all this info to call VTPass later.
    const metadata = {
      action: "UTILITY_PURCHASE",
      serviceID: params.serviceID,
      meterNumber: params.meterNumber,
      type: params.type,
      phone: user.userPhone || "08000000000", // VTPass requires phone
    };

    const paystackRes = await paystackClient.post("/transaction/initialize", {
      email: user.userEmail,
      amount: params.amount * 100,
      reference,
      metadata,
    });

    // D. Create Pending Payment
    await prisma.payment.create({
      data: {
        userId,
        amount: params.amount,
        reference,
        status: PaymentStatus.PENDING,
        type: PaymentType.UTILITY_TOKEN,
        utilityType: this.mapServiceToEnum(params.serviceID),
        meterNo: params.meterNumber,
        metadata: metadata,
      },
    });

    return { url: paystackRes.data.data.authorization_url, reference };
  }

  public async getSavedMeters(userId: string): Promise<utilityProfile[]> {
    return prisma.utilityProfile.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Delete a Saved Meter (Bonus: Users usually want to remove old ones)
   */
  public async deleteSavedMeter(userId: string, meterId: string) {
    // Ensure the meter belongs to the user requesting deletion
    const meter = await prisma.utilityProfile.findFirst({
      where: { id: meterId, userId },
    });

    if (!meter) throw new NotFoundError("Meter profile not found");

    await prisma.utilityProfile.delete({
      where: { id: meterId },
    });

    return { success: true };
  }
}

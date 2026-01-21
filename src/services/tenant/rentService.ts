import { prisma } from "../../config/prisma";
import { paystackClient } from "../../utils/paystackClient";
import {
  InitiateRentRequest,
  RentHistoryResponse,
} from "../../dtos/tenant/rent.dto";
import { NotFoundError, BadRequestError } from "../../utils/apiError";
import { PaymentType, PaymentStatus } from "@prisma/client";

export class RentService {
  /**
   * INITIATE RENT PROCESS
   * Determines if this is a "New Lease" or "Renewal" and prepares the transaction.
   */
  public async initiateRent(userId: string, params: InitiateRentRequest) {
    let leaseId: string | null = null;
    let actionType = "RENT_RENEWAL"; // Default assumption

    // ====================================================
    // 1. VALIDATE BUSINESS LOGIC
    // ====================================================

    // SCENARIO A: NEW MOVE-IN
    if (params.unitId) {
      // Check if unit exists
      const unit = await prisma.unit.findUnique({
        where: { id: params.unitId },
      });
      if (!unit) throw new NotFoundError("Target unit not found.");

      // Check if unit is actually available
      if (unit.status !== "AVAILABLE") {
        throw new BadRequestError(
          "This unit is already occupied or under maintenance.",
        );
      }

      actionType = "NEW_LEASE";
      leaseId = null; // No lease exists yet
    }

    // SCENARIO B: RENEWAL / EXTENSION
    else {
      // Find the user's current lease (Active or recently Expired)
      const currentLease = await prisma.lease.findFirst({
        where: {
          tenantId: userId,
          status: { in: ["ACTIVE", "EXPIRED"] },
        },
      });

      if (!currentLease) {
        throw new NotFoundError(
          "No existing lease found to renew. Please select a unit to move into.",
        );
      }

      leaseId = currentLease.id;
      actionType = "RENT_RENEWAL";
    }

    // ====================================================
    // 2. PREPARE PAYSTACK & DATABASE
    // ====================================================

    const user = await prisma.user.findUnique({ where: { userId: userId } });
    if (!user) throw new NotFoundError("User profile error.");

    // Generate unique reference
    const reference = `RENT-${userId.substring(0, 5)}-${Date.now()}`;

    // Metadata: This is crucial. We pack the instructions for the Verify step here.
    const metadata = {
      action: actionType, // "NEW_LEASE" or "RENT_RENEWAL"
      targetUnitId: params.unitId, // Only present for New Lease
      durationValue: params.durationValue, // e.g., 1
      durationUnit: params.durationUnit, // e.g., "YEAR"
    };

    try {
      // A. Call Paystack
      const paystackRes = await paystackClient.post("/transaction/initialize", {
        email: user.userEmail,
        amount: params.amount * 100, // Convert to Kobo
        reference: reference,
        callback_url: `${process.env.FRONTEND_URL}/payment/verify`,
        metadata: {
          custom_fields: [
            { display_name: "Payment Type", value: "RENT" },
            { display_name: "Action", value: actionType },
          ],
        },
      });

      // B. Create "PENDING" Payment Record
      await prisma.payment.create({
        data: {
          userId: userId,
          leaseId: leaseId, // Null if new lease
          amount: params.amount,
          reference: reference,
          status: PaymentStatus.PENDING,
          type: PaymentType.RENT,
          metadata: metadata, // Store instructions JSON
        },
      });

      return {
        url: paystackRes.data.data.authorization_url,
        reference: reference,
      };
    } catch (error: any) {
      console.error(
        "Paystack Init Error:",
        error.response?.data || error.message,
      );
      throw new BadRequestError("Payment initialization failed.");
    }
  }

  /**
   * GET RENT HISTORY
   */
  public async getRentHistory(userId: string): Promise<RentHistoryResponse[]> {
    const history = await prisma.payment.findMany({
      where: {
        userId,
        type: PaymentType.RENT,
        status: PaymentStatus.PAID,
      },
      orderBy: { createdAt: "desc" },
      include: {
        lease: {
          include: { unit: true },
        },
      },
    });

    return history.map((p) => ({
      paymentId: p.id,
      amount: p.amount,
      date: p.paidDate || p.createdAt,
      status: "PAID",
      reference: p.reference,
      description: p.lease ? `Rent for ${p.lease.unit.name}` : "Lease Payment",
    }));
  }
}

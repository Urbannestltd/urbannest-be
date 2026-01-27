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
   * Handles New Leases, Extensions, and Early Renewals intelligently.
   */
  public async initiateRent(userId: string, params: InitiateRentRequest) {
    let leaseId: string | null = null;
    let actionType = "RENT_RENEWAL";

    // ====================================================
    // 1. DETERMINE SCENARIO & VALIDATE
    // ====================================================

    if (params.unitId) {
      // Fetch the unit to check its status
      const unit = await prisma.unit.findUnique({
        where: { id: params.unitId },
      });
      if (!unit) throw new NotFoundError("Target unit not found.");

      // CHECK: Is this user ALREADY the tenant of this unit?
      const existingLease = await prisma.lease.findFirst({
        where: {
          unitId: params.unitId,
          tenantId: userId,
          status: { in: ["ACTIVE", "EXPIRED"] },
        },
      });

      // SCENARIO A: SELF-RENEWAL (User passed the ID of their own home)
      if (existingLease) {
        actionType = "RENT_RENEWAL";
        leaseId = existingLease.id;
      }

      // SCENARIO B: NEW MOVE-IN (User wants a NEW, DIFFERENT unit)
      else {
        // Strictly enforce availability for new tenants
        if (unit.status !== "AVAILABLE") {
          throw new BadRequestError("This unit is already occupied.");
        }
        actionType = "NEW_LEASE";
        leaseId = null;
      }
    }

    // SCENARIO C: GENERIC RENEWAL (No unitId passed)
    else {
      // Find the latest lease for this user (Active or recently Expired)
      const currentLease = await prisma.lease.findFirst({
        where: {
          tenantId: userId,
          status: { in: ["ACTIVE", "EXPIRED"] },
        },
        orderBy: { endDate: "desc" }, // Pick the one furthest in the future
      });

      if (!currentLease) {
        throw new NotFoundError(
          "No active lease found. Please select a unit to move into.",
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

    const reference = `RENT-${userId.substring(0, 5)}-${Date.now()}`;

    // Pack instructions for the Verification step
    const metadata = {
      action: actionType,
      targetUnitId: params.unitId,
      durationValue: params.durationValue,
      durationUnit: params.durationUnit,
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
            { display_name: "Lease ID", value: leaseId || "New Lease" },
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

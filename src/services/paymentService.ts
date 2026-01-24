import { prisma } from "../config/prisma";
import { paystackClient } from "../utils/paystackClient";
import { NotFoundError, BadRequestError } from "../utils/apiError";
import { PaymentStatus, UnitStatus, LeaseStatus } from "@prisma/client";
import { VTPassService } from "./external/vtPassService";

export class PaymentService {
  private vtpass = new VTPassService();

  public async verifyPayment(reference: string) {
    // ====================================================
    // PHASE 1: PRE-CHECKS (Fast, No Transaction)
    // ====================================================

    // 1. Verify with Paystack
    let verifyRes;
    try {
      verifyRes = await paystackClient.get(`/transaction/verify/${reference}`);
    } catch (error) {
      throw new Error("Could not contact Payment Provider.");
    }

    if (verifyRes.data.data.status !== "success") {
      await prisma.payment.update({
        where: { reference },
        data: { status: PaymentStatus.FAILED },
      });
      throw new BadRequestError("Payment was not successful.");
    }

    // 2. Find Local Record
    const payment = await prisma.payment.findUnique({ where: { reference } });
    if (!payment) throw new NotFoundError("Transaction record not found.");

    if (payment.status === PaymentStatus.PAID) {
      return {
        success: true,
        message: "Transaction already processed.",
        token: payment.utilityToken || undefined,
      };
    }

    const meta = payment.metadata as any;

    // ====================================================
    // PHASE 2: HANDLE UTILITIES (External API - NO Transaction)
    // ====================================================
    // We do this OUTSIDE the transaction so the database doesn't wait for VTPass

    if (meta?.action === "UTILITY_PURCHASE") {
      try {
        console.log("...Calling VTPass API");

        // A. The Slow Network Call (Happens without locking DB)
        const vendResult = await this.vtpass.purchaseProduct(
          reference,
          meta.serviceID,
          meta.meterNumber,
          meta.type,
          payment.amount,
          meta.phone,
        );

        // B. The Fast Database Update
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.PAID,
            paidDate: new Date(),
            utilityToken: vendResult.token,
            metadata: {
              ...meta,
              vtpass_txn: vendResult.transactionId,
              vending_status: "SUCCESS",
            },
          },
        });

        return {
          success: true,
          token: vendResult.token,
          message: "Purchase successful!",
        };
      } catch (error: any) {
        console.error(`Vending Failed for Ref ${reference}:`, error.message);

        // Update DB to show we took money but failed to vend
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.PAID, // Money is with us
            paidDate: new Date(),
            metadata: {
              ...meta,
              vending_status: "FAILED",
              error_msg: error.message,
            },
          },
        });

        return {
          success: true,
          token: null,
          requiresAttention: true,
          message: "Payment received, but token generation delayed.",
        };
      }
    }

    // ====================================================
    // PHASE 3: HANDLE RENT/LEASES (Pure DB - Safe for Transaction)
    // ====================================================
    // These operations touch multiple tables (Lease, Unit, User), so we NEED a transaction.
    // Since there are no API calls here, it will run in < 100ms (no timeout).

    return await prisma.$transaction(async (tx) => {
      let finalLeaseId = payment.leaseId;

      const calculateEndDate = (startDate: Date) => {
        const val = meta.durationValue || 1;
        const unit = meta.durationUnit || "YEAR";
        const end = new Date(startDate);
        if (unit === "YEAR") end.setFullYear(end.getFullYear() + val);
        else end.setMonth(end.getMonth() + val);
        return end;
      };

      // --- Logic A: New Lease ---
      if (meta?.action === "NEW_LEASE" && meta?.targetUnitId) {
        const unitCheck = await tx.unit.findUnique({
          where: { id: meta.targetUnitId },
        });
        if (unitCheck?.status !== UnitStatus.AVAILABLE) {
          throw new Error("Unit was taken by another user.");
        }

        const startDate = new Date();
        const endDate = calculateEndDate(startDate);

        const newLease = await tx.lease.create({
          data: {
            tenantId: payment.userId,
            unitId: meta.targetUnitId,
            startDate: startDate,
            endDate: endDate,
            rentAmount: payment.amount,
            status: LeaseStatus.ACTIVE,
          },
        });

        await tx.unit.update({
          where: { id: meta.targetUnitId },
          data: { status: UnitStatus.OCCUPIED },
        });

        await tx.user.update({
          where: { userId: payment.userId },
          data: { userStatus: "ACTIVE" },
        });

        finalLeaseId = newLease.id;
      }

      // --- Logic B: Renewal ---
      else if (meta?.action === "RENT_RENEWAL" && finalLeaseId) {
        const currentLease = await tx.lease.findUnique({
          where: { id: finalLeaseId },
        });
        if (!currentLease) throw new BadRequestError("Lease record missing.");

        const baseDate = new Date(currentLease.endDate);
        const effectiveStartDate =
          baseDate < new Date() ? new Date() : baseDate;
        const newEndDate = calculateEndDate(effectiveStartDate);

        await tx.lease.update({
          where: { id: finalLeaseId },
          data: {
            endDate: newEndDate,
            status: LeaseStatus.ACTIVE,
          },
        });
      }

      // --- Finalize ---
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.PAID,
          paidDate: new Date(),
          leaseId: finalLeaseId,
        },
      });

      return {
        success: true,
        message: "Transaction successful and lease updated.",
      };
    });
  }
}

import { prisma } from "../config/prisma";
import { paystackClient } from "../utils/paystackClient";
import { NotFoundError, BadRequestError } from "../utils/apiError";
import { PaymentStatus, UnitStatus, LeaseStatus } from "@prisma/client";
import { VTPassService } from "./external/vtPassService";

export class PaymentService {
  private vtpass = new VTPassService();
  public async verifyPayment(reference: string) {
    // 1. Verify with Paystack (Source of Truth)
    let verifyRes;
    try {
      verifyRes = await paystackClient.get(`/transaction/verify/${reference}`);
    } catch (error) {
      // throw new BadRequestError("Could not verify transaction with provider.");
      throw new Error(
        "Could not contact Payment Provider. Please try verifying again later.",
      );
    }

    // if (verifyRes.data.data.status !== "success") {
    //   throw new BadRequestError("Payment was not successful.");
    // }

    if (verifyRes.data.data.status !== "success") {
      // Logic for failed payment (e.g. Insufficient Funds)
      await prisma.payment.update({
        where: { reference },
        data: { status: PaymentStatus.FAILED },
      });
      throw new BadRequestError("Payment was not successful.");
    }

    // 2. Find Local Record
    const payment = await prisma.payment.findUnique({ where: { reference } });
    if (!payment) throw new NotFoundError("Transaction record not found.");

    // Idempotency check: Don't process twice
    if (payment.status === PaymentStatus.PAID) {
      return {
        success: true,
        message: "Transaction already processed.",
        // Return existing token if we have it
        token: payment.utilityToken || undefined,
      };
    }

    // 3. EXECUTE ATOMIC TRANSACTION
    // We use a transaction so we don't take money without giving the lease
    await prisma.$transaction(async (tx) => {
      const meta = payment.metadata as any; // Retrieve instructions
      let finalLeaseId = payment.leaseId;

      // Helper: Calculate End Date based on duration
      const calculateEndDate = (startDate: Date) => {
        const val = meta.durationValue || 1;
        const unit = meta.durationUnit || "YEAR";
        const end = new Date(startDate);

        if (unit === "YEAR") end.setFullYear(end.getFullYear() + val);
        else end.setMonth(end.getMonth() + val); // Assume MONTH

        return end;
      };

      // ============================================
      // LOGIC A: NEW LEASE (Move-In)
      // ============================================
      if (meta?.action === "NEW_LEASE" && meta?.targetUnitId) {
        // Race Condition Check: Ensure unit is STILL available
        const unitCheck = await tx.unit.findUnique({
          where: { id: meta.targetUnitId },
        });
        if (unitCheck?.status !== UnitStatus.AVAILABLE) {
          throw new Error("Unit was taken by another user during payment.");
        }

        const startDate = new Date();
        const endDate = calculateEndDate(startDate);

        // Create Lease
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

        // Mark Unit as Occupied
        await tx.unit.update({
          where: { id: meta.targetUnitId },
          data: { status: UnitStatus.OCCUPIED },
        });

        // Mark User as Active Tenant
        await tx.user.update({
          where: { userId: payment.userId },
          data: { userStatus: "ACTIVE" }, // Assuming 'ACTIVE' is a valid UserStatus
        });

        finalLeaseId = newLease.id;
      }

      // ============================================
      // LOGIC B: RENEWAL (Extension)
      // ============================================
      else if (meta?.action === "RENT_RENEWAL" && finalLeaseId) {
        const currentLease = await tx.lease.findUnique({
          where: { id: finalLeaseId },
        });
        if (!currentLease) throw new BadRequestError("Lease record missing.");

        // Seamless Renewal: Start new term from the old end date
        // If lease was long expired, you might want to reset to Date.now()
        const baseDate = new Date(currentLease.endDate);
        // Safety: If lease expired 6 months ago, start from today, not 6 months ago
        const effectiveStartDate =
          baseDate < new Date() ? new Date() : baseDate;

        const newEndDate = calculateEndDate(effectiveStartDate);

        await tx.lease.update({
          where: { id: finalLeaseId },
          data: {
            endDate: newEndDate,
            status: LeaseStatus.ACTIVE, // Reactivate if it was EXPIRED
          },
        });
      }

      if (meta?.action === "UTILITY_PURCHASE") {
        try {
          const vendResult = await this.vtpass.purchaseProduct(
            reference,
            meta.serviceID,
            meta.meterNumber,
            payment.amount,
            meta.phone,
          );

          // B. SUCCESS: Update DB with Token
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

          // We mark as PAID because we have the money.
          // We log the error in metadata for Admin to see "VENDING_FAILED"
          await prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: PaymentStatus.PAID, // Financial Truth
              paidDate: new Date(),
              metadata: {
                ...meta,
                vending_status: "FAILED",
                error_msg: error.message,
              },
            },
          });
        }

        // Return a specific "Warning" response to Frontend
        return {
          success: true, // true because payment succeeded
          token: null,
          requiresAttention: true,
          message:
            "Payment received, but token generation delayed. Our team has been notified.",
        };
      }

      // ============================================
      // 4. FINALIZE PAYMENT
      // ============================================
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.PAID,
          paidDate: new Date(),
          leaseId: finalLeaseId, // Ensure payment is linked to the correct lease
        },
      });
    });

    return {
      success: true,
      message: "Transaction successful and lease updated.",
    };
  }
}

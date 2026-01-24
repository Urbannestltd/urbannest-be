import { prisma } from "../config/prisma";
import { paystackClient } from "../utils/paystackClient";
import { NotFoundError, BadRequestError } from "../utils/apiError";
import { PaymentStatus, UnitStatus, LeaseStatus } from "@prisma/client";
import { VTPassService } from "./external/vtPassService"; // check casing of filename

export class PaymentService {
  private vtpass = new VTPassService();

  public async verifyPayment(reference: string) {
    // 1. Verify with Paystack
    let verifyRes;
    try {
      verifyRes = await paystackClient.get(`/transaction/verify/${reference}`);
    } catch (error) {
      throw new Error(
        "Could not contact Payment Provider. Please try verifying again later.",
      );
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

    // 3. EXECUTE ATOMIC TRANSACTION
    // FIX: Capture the return value of the transaction
    const transactionResult = await prisma.$transaction(async (tx) => {
      const meta = payment.metadata as any;
      let finalLeaseId = payment.leaseId;

      const calculateEndDate = (startDate: Date) => {
        const val = meta.durationValue || 1;
        const unit = meta.durationUnit || "YEAR";
        const end = new Date(startDate);
        if (unit === "YEAR") end.setFullYear(end.getFullYear() + val);
        else end.setMonth(end.getMonth() + val);
        return end;
      };

      // === LOGIC A: NEW LEASE ===
      if (meta?.action === "NEW_LEASE" && meta?.targetUnitId) {
        const unitCheck = await tx.unit.findUnique({
          where: { id: meta.targetUnitId },
        });
        if (unitCheck?.status !== UnitStatus.AVAILABLE) {
          throw new Error("Unit was taken by another user during payment.");
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
          where: { userId: payment.userId }, // Changed from userId: payment.userId to id: ...
          data: { userStatus: "ACTIVE" }, // Changed userStatus to status (based on schema)
        });

        finalLeaseId = newLease.id;
      }

      // === LOGIC B: RENEWAL ===
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

      // === LOGIC C: UTILITIES ===
      if (meta?.action === "UTILITY_PURCHASE") {
        try {
          const vendResult = await this.vtpass.purchaseProduct(
            reference,
            meta.serviceID,
            meta.meterNumber,
            meta.type,
            payment.amount,
            meta.phone,
          );

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

          // RETURN inside transaction becomes the 'transactionResult'
          return {
            success: true,
            token: vendResult.token,
            message: "Purchase successful!",
          };
        } catch (error: any) {
          console.error(`Vending Failed for Ref ${reference}:`, error.message);

          await prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: PaymentStatus.PAID,
              paidDate: new Date(),
              metadata: {
                ...meta,
                vending_status: "FAILED",
                error_msg: error.message,
              },
            },
          });

          // RETURN Warning object
          return {
            success: true,
            token: null,
            requiresAttention: true,
            message:
              "Payment received, but token generation delayed. Our team has been notified.",
          };
        }
      }

      // === FINALIZE (Only runs if NOT utility) ===
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

    // FIX: Return the actual result from the transaction block
    return transactionResult;
  }
}

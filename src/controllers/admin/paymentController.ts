import * as express from "express";
import { Get, Middlewares, Query, Request, Route, Security, Tags } from "tsoa";
import { PaymentStatus, PaymentType, Permission } from "@prisma/client";
import { AdminPaymentService } from "../../services/admin/paymentService";
import { requirePermission } from "../../middlewares/permissionMiddleware";

@Route("admin/payments")
@Tags("Admin - Payment Management")
@Security("jwt")
@Middlewares(requirePermission(Permission.VIEW_FINANCIALS_AND_REPORTS))
export class AdminPaymentController {
  private paymentService = new AdminPaymentService();

  @Get("/metrics")
  public async getFinancialMetrics(@Query() propertyId?: string) {
    const metrics = await this.paymentService.getFinancialMetrics(propertyId);
    return { success: true, message: "Financial metrics retrieved", data: metrics };
  }

  @Get("/")
  public async getAllPayments(
    @Query() propertyId?: string,
    @Query() tenantId?: string,
    @Query() status?: PaymentStatus,
    @Query() startDate?: string,
    @Query() endDate?: string,
    @Query() type?: PaymentType,
    @Query() source?: "PAYMENT" | "EXPENSE",
  ) {
    const payments = await this.paymentService.getAllPayments({
      propertyId,
      tenantId,
      status,
      startDate,
      endDate,
      type,
      source,
    });
    return {
      success: true,
      message: "Payments retrieved successfully",
      data: payments,
    };
  }

  @Get("/export")
  public async exportPayments(
    @Request() request: express.Request,
    @Query() propertyId?: string,
    @Query() tenantId?: string,
    @Query() startDate?: string,
    @Query() endDate?: string,
    @Query() type?: PaymentType,
    @Query() source?: "PAYMENT" | "EXPENSE",
  ) {
    const csv = await this.paymentService.generateCsvExport({
      propertyId,
      tenantId,
      startDate,
      endDate,
      type,
      source,
    });
    const res = request.res!;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="payments-${Date.now()}.csv"`,
    );
    res.send(csv);
  }
}

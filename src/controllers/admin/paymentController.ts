import * as express from "express";
import { Get, Query, Request, Route, Security, Tags } from "tsoa";
import { PaymentType } from "@prisma/client";
import { AdminPaymentService } from "../../services/admin/paymentService";

@Route("admin/payments")
@Tags("Admin - Payment Management")
@Security("jwt", ["ADMIN"])
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
    @Query() startDate?: string,
    @Query() endDate?: string,
    @Query() type?: PaymentType,
  ) {
    const payments = await this.paymentService.getAllPayments({
      propertyId,
      tenantId,
      startDate,
      endDate,
      type,
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
  ) {
    const csv = await this.paymentService.generateCsvExport({
      propertyId,
      tenantId,
      startDate,
      endDate,
      type,
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

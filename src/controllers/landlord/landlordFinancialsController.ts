import { Get, Query, Route, Controller, Tags, Security, Request } from "tsoa";
import { LandlordFinancialsService } from "../../services/landlord/landlordFinancialsService";
import {
  FinancialsSummaryQuerySchema,
  FinancialsTransactionsQuerySchema,
  FinancialsExportQuerySchema,
  type FinancialsSummary,
  type FinancialRevenueByProperty,
  type FinancialRevenueByUnit,
  type FinancialRevenueShare,
  type FinancialArrearItem,
  type FinancialTransactionItem,
} from "../../dtos/landlord/landlord.financials.dto";
import { validate } from "../../utils/validate";

@Route("landlord/financials")
@Tags("Landlord - Financials")
@Security("jwt", ["LANDLORD"])
export class LandlordFinancialsController extends Controller {
  private service = new LandlordFinancialsService();

  /**
   * Returns the three financial KPI cards for the financials center.
   * - totalRevenueCollected: sum of PAID RENT payments within the selected calendar year
   * - totalOutstandingRent: sum of PENDING/OVERDUE RENT payment amounts across the portfolio
   * - activeLeasesCount: number of ACTIVE leases
   * - totalUnitsCount: total non-deleted unit count (used to compute the ratio on the client)
   *
   * Filters: propertyId scopes all metrics to one property. year defaults to current calendar year.
   */
  @Get("summary")
  public async getSummary(
    @Request() req: any,
    @Query() propertyId?: string,
    @Query() year?: number,
  ): Promise<{ success: boolean; data: FinancialsSummary }> {
    const query = validate(FinancialsSummaryQuerySchema, { propertyId, year });
    const data = await this.service.getSummary(req.user.userId, query);
    return { success: true, data };
  }

  /**
   * Returns grouped revenue chart data.
   *
   * Without propertyId: groups by property — expectedRevenue vs collectedRevenue per property.
   * With propertyId: groups by unit within that property — expectedRent vs collectedRent per unit.
   *
   * Expected revenue is derived from ACTIVE lease rentAmounts weighted by months overlapping
   * the selected calendar year.
   */
  @Get("revenue-chart")
  public async getRevenueChart(
    @Request() req: any,
    @Query() propertyId?: string,
    @Query() year?: number,
  ): Promise<{ success: boolean; data: FinancialRevenueByProperty[] | FinancialRevenueByUnit[] }> {
    const query = validate(FinancialsSummaryQuerySchema, { propertyId, year });
    const data = await this.service.getRevenueChart(req.user.userId, query);
    return { success: true, data };
  }

  /**
   * Returns revenue share data for the pie/donut chart.
   * Each entry shows a property's share of total portfolio revenue collected in the selected year.
   * revenuePercentage is rounded to 2 decimal places (e.g. 33.33).
   */
  @Get("revenue-share")
  public async getRevenueShare(
    @Request() req: any,
    @Query() propertyId?: string,
    @Query() year?: number,
  ): Promise<{ success: boolean; data: FinancialRevenueShare[] }> {
    const query = validate(FinancialsSummaryQuerySchema, { propertyId, year });
    const data = await this.service.getRevenueShare(req.user.userId, query);
    return { success: true, data };
  }

  /**
   * Returns the top arrears and deficits table.
   * Lists leases with outstanding (PENDING/OVERDUE) rent payments, sorted by total balance due
   * descending so the largest debtors appear first.
   *
   * daysOverdue is calculated from the oldest unpaid payment's dueDate to today.
   */
  @Get("arrears")
  public async getArrears(
    @Request() req: any,
    @Query() propertyId?: string,
    @Query() year?: number,
  ): Promise<{ success: boolean; data: FinancialArrearItem[] }> {
    const query = validate(FinancialsSummaryQuerySchema, { propertyId, year });
    const data = await this.service.getArrears(req.user.userId, query);
    return { success: true, data };
  }

  /**
   * Returns the full transaction history for the landlord's portfolio.
   * Ordered by transaction date descending (most recent first).
   *
   * Filters:
   * - propertyId: scope to a single property
   * - startDate / endDate: ISO date strings (YYYY-MM-DD) to bound the date range
   */
  @Get("transactions")
  public async getTransactions(
    @Request() req: any,
    @Query() propertyId?: string,
    @Query() startDate?: string,
    @Query() endDate?: string,
  ): Promise<{ success: boolean; data: FinancialTransactionItem[] }> {
    const query = validate(FinancialsTransactionsQuerySchema, { propertyId, startDate, endDate });
    const data = await this.service.getTransactions(req.user.userId, query);
    return { success: true, data };
  }

  /**
   * Exports the transaction ledger as CSV or Excel (xlsx).
   *
   * The same date range and property filters from the transactions endpoint apply here.
   * The response is a file download; use the `format` parameter to select the output type.
   *
   * Columns: Date, Tenant, Property, Unit, Amount, Type, Status, Reference
   */
  @Get("export")
  public async exportLedger(
    @Request() req: any,
    @Query() format?: string,
    @Query() propertyId?: string,
    @Query() startDate?: string,
    @Query() endDate?: string,
  ): Promise<void> {
    const query = validate(FinancialsExportQuerySchema, { format, propertyId, startDate, endDate });
    await this.service.exportLedger(req.user.userId, query, req.res);
  }
}

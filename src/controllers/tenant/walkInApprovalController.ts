import {
  Controller,
  Get,
  Post,
  Path,
  Middlewares,
  Route,
  Tags,
  Security,
  Request,
} from "tsoa";
import { prisma } from "../../config/prisma";
import { resolveWalkInApproval } from "../../services/facility-manager/fmWalkInsService";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/apiError";
import { Permission } from "@prisma/client";
import { requirePermission } from "../../middlewares/permissionMiddleware";
import type { WalkInListItem } from "../../dtos/facility-manager/fm.walk-ins.dto";

@Route("tenant/walk-in-approvals")
@Tags("Tenant - Walk-In Approvals")
@Security("jwt", ["TENANT"])
@Middlewares(requirePermission(Permission.VISITOR_ALLOWANCE))
export class WalkInApprovalController extends Controller {
  /**
   * Returns all PENDING walk-in approvals for the authenticated tenant's units.
   */
  @Get()
  public async listPendingApprovals(
    @Request() req: any,
  ): Promise<{ success: boolean; data: WalkInListItem[] }> {
    const visits = await prisma.visitorInvite.findMany({
      where: {
        tenantId: req.user.userId,
        isWalkIn: true,
        status: "PENDING",
      },
      include: {
        unit: {
          select: {
            id: true,
            name: true,
            property: { select: { id: true, name: true } },
          },
        },
        tenant: { select: { userFullName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const data: WalkInListItem[] = visits.map((v) => {
      const secondsUntilExpiry = v.approvalExpiresAt
        ? Math.max(0, Math.floor((v.approvalExpiresAt.getTime() - Date.now()) / 1000))
        : null;
      return {
        id: v.id,
        visitorName: v.visitorName,
        visitorPhone: v.visitorPhone,
        visitorType: v.type,
        frequency: v.frequency,
        status: v.status,
        unitId: v.unit.id,
        unitName: v.unit.name,
        propertyId: v.unit.property.id,
        propertyName: v.unit.property.name,
        tenantName: v.tenant?.userFullName ?? null,
        fallbackRule: v.fallbackRule,
        approvalExpiresAt: v.approvalExpiresAt,
        secondsUntilExpiry,
        checkedInAt: v.checkedInAt,
        checkedOutAt: v.checkedOutAt,
        createdAt: v.createdAt,
      };
    });

    return { success: true, data };
  }

  /**
   * Approves a walk-in visitor via the tenant's app.
   * Sets status to CHECKED_IN and records checkedInAt.
   */
  @Post("{visitId}/approve")
  public async approve(
    @Path() visitId: string,
    @Request() req: any,
  ): Promise<{ success: boolean; message: string }> {
    await this.assertTenantOwnsVisit(req.user.userId, visitId);
    await resolveWalkInApproval(visitId, "approve", req.user.userId);
    return { success: true, message: "Visitor approved" };
  }

  /**
   * Rejects a walk-in visitor via the tenant's app.
   * Sets status to REJECTED.
   */
  @Post("{visitId}/reject")
  public async reject(
    @Path() visitId: string,
    @Request() req: any,
  ): Promise<{ success: boolean; message: string }> {
    await this.assertTenantOwnsVisit(req.user.userId, visitId);
    await resolveWalkInApproval(visitId, "reject", req.user.userId);
    return { success: true, message: "Visitor denied" };
  }

  private async assertTenantOwnsVisit(tenantId: string, visitId: string) {
    const visit = await prisma.visitorInvite.findUnique({
      where: { id: visitId },
      select: { tenantId: true, isWalkIn: true },
    });
    if (!visit) throw new NotFoundError("Walk-in visit not found");
    if (!visit.isWalkIn) throw new BadRequestError("This is not a walk-in visit");
    if (visit.tenantId !== tenantId) throw new ForbiddenError("This visit does not belong to you");
  }
}

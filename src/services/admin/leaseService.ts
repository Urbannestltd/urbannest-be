import { PrismaClient, UnitStatus, LeaseStatus } from "@prisma/client";
import {
  CreateLeaseDto,
  LeaseDetailDto,
  UpdateLeaseDto,
  RenewLeaseDto,
} from "../../dtos/admin/lease.dto";
import { BadRequestError } from "../../utils/apiError";
import { ZeptoMailService } from "../external/zeptoMailService";
import { adminLeaseCreatedEmail, adminLeaseRenewedEmail } from "../../config/emailTemplates";
import { getAdminRecipients } from "../../utils/getAdminRecipients";

const prisma = new PrismaClient();

export class AdminLeaseService {
  private emailService = new ZeptoMailService();

  public async createLease(data: CreateLeaseDto) {
    // 1. Verify the tenant exists and has the TENANT role
    const tenant = await prisma.user.findFirst({
      where: {
        userId: data.tenantId,
        userRole: { roleName: "TENANT" },
      },
    });
    if (!tenant)
      throw new BadRequestError("Invalid tenant ID or user is not a Tenant.");

    // 2. Verify the unit exists and is actually available
    const unit = await prisma.unit.findUnique({ where: { id: data.unitId } });
    if (!unit) throw new BadRequestError("Unit not found.");
    if (unit.status === UnitStatus.OCCUPIED) {
      throw new BadRequestError(
        "This unit is already occupied by another active lease.",
      );
    }

    // 3. Create the lease and update the unit status in a single transaction
    const unitWithProperty = await prisma.unit.findUnique({
      where: { id: data.unitId },
      include: { property: true },
    });

    const [newLease] = await prisma.$transaction([
      prisma.lease.create({
        data: {
          tenantId: data.tenantId,
          unitId: data.unitId,
          rentAmount: data.rentAmount,
          serviceCharge: data.serviceCharge || 0,
          startDate: new Date(data.startDate),
          endDate: new Date(data.endDate),
          moveOutNotice: data.moveOutNotice,
          documentUrl: data.documentUrl,
          status: LeaseStatus.ACTIVE,
        },
      }),
      prisma.unit.update({
        where: { id: data.unitId },
        data: { status: UnitStatus.OCCUPIED },
      }),
    ]);

    // Notify admins with lease notifications enabled
    const adminRecipients = await getAdminRecipients("emailLease");
    for (const admin of adminRecipients) {
      const { subject, html } = adminLeaseCreatedEmail(
        admin.name ?? "Admin",
        tenant.userFullName ?? "Tenant",
        unitWithProperty?.property?.name ?? "Unknown Property",
        unitWithProperty?.name ?? "Unknown Unit",
        new Date(data.startDate),
        new Date(data.endDate),
        data.rentAmount,
      );
      await this.emailService.sendEmail(
        { email: admin.email, name: admin.name ?? undefined },
        subject,
        html,
      );
    }

    return newLease;
  }

  // --- GET LEASE BY ID ---
  public async getLeaseById(leaseId: string): Promise<LeaseDetailDto> {
    const lease = await prisma.lease.findUnique({
      where: { id: leaseId },
      include: {
        tenant: {
          select: { userId: true, userFullName: true, userPhone: true },
        },
        unit: {
          select: {
            id: true,
            name: true,
            property: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!lease) throw new BadRequestError("Lease not found.");

    return {
      id: lease.id,
      status: lease.status,
      rentAmount: lease.rentAmount,
      serviceCharge: lease.serviceCharge ?? null,
      startDate: lease.startDate,
      endDate: lease.endDate,
      moveOutNotice: lease.moveOutNotice ?? null,
      documentUrl: lease.documentUrl ?? null,
      tenant: lease.tenant
        ? { id: lease.tenant.userId, name: lease.tenant.userFullName, phone: lease.tenant.userPhone }
        : null,
      unit: lease.unit ? { id: lease.unit.id, name: lease.unit.name } : null,
      property: lease.unit?.property
        ? { id: lease.unit.property.id, name: lease.unit.property.name }
        : null,
    };
  }

  // --- EDIT ACTIVE LEASE ---
  public async updateLease(leaseId: string, data: UpdateLeaseDto) {
    const lease = await prisma.lease.findUnique({ where: { id: leaseId } });
    if (!lease) throw new BadRequestError("Lease not found.");
    if (lease.status !== LeaseStatus.ACTIVE) {
      throw new BadRequestError(
        "Only active leases can be edited. Use renew to create a new lease.",
      );
    }

    return await prisma.lease.update({
      where: { id: leaseId },
      data: {
        ...(data.rentAmount !== undefined && { rentAmount: data.rentAmount }),
        ...(data.serviceCharge !== undefined && {
          serviceCharge: data.serviceCharge,
        }),
        ...(data.startDate !== undefined && {
          startDate: new Date(data.startDate),
        }),
        ...(data.endDate !== undefined && { endDate: new Date(data.endDate) }),
        ...(data.moveOutNotice !== undefined && {
          moveOutNotice: data.moveOutNotice,
        }),
        ...(data.documentUrl !== undefined && {
          documentUrl: data.documentUrl,
        }),
      },
    });
  }

  // --- RENEW INACTIVE LEASE ---
  public async renewLease(leaseId: string, data: RenewLeaseDto) {
    const previousLease = await prisma.lease.findUnique({
      where: { id: leaseId },
    });
    if (!previousLease) throw new BadRequestError("Lease not found.");
    if (previousLease.status === LeaseStatus.ACTIVE) {
      throw new BadRequestError(
        "Lease is still active. Use edit to update it instead.",
      );
    }

    const renewedLease = await prisma.$transaction(async (tx) => {
      const newLease = await tx.lease.create({
        data: {
          tenantId: previousLease.tenantId,
          unitId: previousLease.unitId,
          rentAmount: data.rentAmount ?? previousLease.rentAmount,
          serviceCharge:
            data.serviceCharge ?? previousLease.serviceCharge ?? 0,
          startDate: new Date(data.startDate),
          endDate: new Date(data.endDate),
          moveOutNotice: data.moveOutNotice ?? previousLease.moveOutNotice,
          documentUrl: data.documentUrl ?? previousLease.documentUrl,
          status: LeaseStatus.ACTIVE,
        },
      });

      await tx.unit.update({
        where: { id: previousLease.unitId },
        data: { status: UnitStatus.OCCUPIED },
      });

      return newLease;
    });

    // Notify admins with lease notifications enabled
    const adminRecipients = await getAdminRecipients("emailLease");
    if (adminRecipients.length > 0) {
      const tenantUser = await prisma.user.findUnique({
        where: { userId: previousLease.tenantId },
        select: { userFullName: true },
      });
      const unitWithProperty = await prisma.unit.findUnique({
        where: { id: previousLease.unitId },
        include: { property: true },
      });
      for (const admin of adminRecipients) {
        const { subject, html } = adminLeaseRenewedEmail(
          admin.name ?? "Admin",
          tenantUser?.userFullName ?? "Tenant",
          unitWithProperty?.property?.name ?? "Unknown Property",
          unitWithProperty?.name ?? "Unknown Unit",
          new Date(data.endDate),
          data.rentAmount ?? previousLease.rentAmount,
        );
        await this.emailService.sendEmail(
          { email: admin.email, name: admin.name ?? undefined },
          subject,
          html,
        );
      }
    }

    return renewedLease;
  }
}

import { prisma } from "../../config/prisma";
import {
  AdminGetPaymentsQuery,
  AdminPaymentListItemDto,
} from "../../dtos/admin/payment.dto";

export class AdminPaymentService {
  public async getAllPayments(
    filters: AdminGetPaymentsQuery,
  ): Promise<AdminPaymentListItemDto[]> {
    const payments = await prisma.payment.findMany({
      where: {
        ...(filters.tenantId && { userId: filters.tenantId }),
        ...(filters.type && { type: filters.type }),
        ...(filters.startDate || filters.endDate
          ? {
              createdAt: {
                ...(filters.startDate && { gte: new Date(filters.startDate) }),
                ...(filters.endDate && { lte: new Date(filters.endDate) }),
              },
            }
          : {}),
        ...(filters.propertyId && {
          lease: { unit: { propertyId: filters.propertyId } },
        }),
      },
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            userId: true,
            userFullName: true,
            userEmail: true,
          },
        },
        lease: {
          include: {
            unit: {
              include: {
                property: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        },
      },
    });

    return payments.map((payment) => ({
      id: payment.id,
      reference: payment.reference,
      amount: payment.amount,
      status: payment.status,
      type: payment.type,
      dueDate: payment.dueDate,
      paidDate: payment.paidDate,
      createdAt: payment.createdAt,
      tenant: payment.user
        ? {
            id: payment.user.userId,
            name: payment.user.userFullName ?? payment.user.userEmail,
            email: payment.user.userEmail,
          }
        : null,
      unit: payment.lease?.unit
        ? {
            id: payment.lease.unit.id,
            name: payment.lease.unit.name,
          }
        : null,
      property: payment.lease?.unit?.property
        ? {
            id: payment.lease.unit.property.id,
            name: payment.lease.unit.property.name,
          }
        : null,
    }));
  }

  public async generateCsvExport(
    filters: AdminGetPaymentsQuery,
  ): Promise<string> {
    const payments = await this.getAllPayments(filters);

    const header = [
      "id",
      "reference",
      "amount",
      "status",
      "type",
      "paidDate",
      "dueDate",
      "createdAt",
      "tenantName",
      "tenantEmail",
      "propertyName",
      "unitName",
    ].join(",");

    const rows = payments.map((p) => {
      const escape = (val: string | null | undefined) => {
        if (val == null) return "";
        return `"${String(val).replace(/"/g, '""')}"`;
      };
      return [
        escape(p.id),
        escape(p.reference),
        p.amount,
        escape(p.status),
        escape(p.type),
        escape(p.paidDate?.toISOString() ?? null),
        escape(p.dueDate?.toISOString() ?? null),
        escape(p.createdAt.toISOString()),
        escape(p.tenant?.name ?? null),
        escape(p.tenant?.email ?? null),
        escape(p.property?.name ?? null),
        escape(p.unit?.name ?? null),
      ].join(",");
    });

    return [header, ...rows].join("\n");
  }
}

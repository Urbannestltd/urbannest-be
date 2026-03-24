import { PrismaClient, UnitStatus, LeaseStatus } from "@prisma/client";
import { CreateLeaseDto } from "../../dtos/admin/lease.dto";

const prisma = new PrismaClient();

export class AdminLeaseService {
  public async createLease(data: CreateLeaseDto) {
    // 1. Verify the tenant exists and has the TENANT role
    const tenant = await prisma.user.findFirst({
      where: {
        userId: data.tenantId,
        userRole: { roleName: "TENANT" },
      },
    });
    if (!tenant) throw new Error("Invalid tenant ID or user is not a Tenant.");

    // 2. Verify the unit exists and is actually available
    const unit = await prisma.unit.findUnique({ where: { id: data.unitId } });
    if (!unit) throw new Error("Unit not found.");
    if (unit.status === UnitStatus.OCCUPIED) {
      throw new Error("This unit is already occupied by another active lease.");
    }

    // 3. Create the lease and update the unit status in a single transaction
    const [newLease, updatedUnit] = await prisma.$transaction([
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

    return newLease;
  }
}

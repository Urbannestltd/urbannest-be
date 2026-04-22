// prisma/seedAdminPermissions.ts
// Grants all five permissions to admin@urbannest.com.
// Run with:  npx ts-node prisma/seedAdminPermissions.ts

import { PrismaClient, Permission } from "@prisma/client";

const prisma = new PrismaClient();

const ADMIN_EMAIL = "admin@urbannest.com";

const ALL_PERMISSIONS: Permission[] = [
  Permission.VIEW_FINANCIALS_AND_REPORTS,
  Permission.MANAGE_PROPERTIES_AND_UNITS,
  Permission.VIEW_TENANTS_AND_LEASES,
  Permission.VIEW_MAINTENANCE_TICKETS,
  Permission.APPROVE_MAJOR_MAINTENANCE,
];

async function main() {
  const admin = await prisma.user.findUnique({
    where: { userEmail: ADMIN_EMAIL },
    select: { userId: true, userFullName: true },
  });

  if (!admin) {
    throw new Error(`No user found with email "${ADMIN_EMAIL}". Run the main seed first.`);
  }

  await prisma.user.update({
    where: { userId: admin.userId },
    data: { permissions: ALL_PERMISSIONS },
  });

  console.log(`✅ All permissions granted to ${ADMIN_EMAIL}`);
  console.log(`   ${ALL_PERMISSIONS.join("\n   ")}`);
}

main()
  .catch((e) => {
    console.error("❌ Failed:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

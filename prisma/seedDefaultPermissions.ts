/**
 * prisma/seedDefaultPermissions.ts
 *
 * Assigns default permissions to every existing user based on their role.
 * Safe to re-run — it overwrites the permissions array each time.
 *
 * Run with:
 *   npx ts-node prisma/seedDefaultPermissions.ts
 */

import { PrismaClient } from "@prisma/client";
import { ROLE_PERMISSIONS } from "../src/config/rolePermissions";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: {
      userId: true,
      userEmail: true,
      userRole: { select: { roleName: true } },
    },
  });

  let updated = 0;
  let skipped = 0;

  for (const user of users) {
    const roleName = user.userRole.roleName;
    const permissions = ROLE_PERMISSIONS[roleName] ?? [];

    if (permissions.length === 0) {
      console.log(
        `  ⚪ ${user.userEmail} (${roleName}) — no permissions defined, skipping`,
      );
      skipped++;
      continue;
    }

    await prisma.user.update({
      where: { userId: user.userId },
      data: { permissions },
    });

    console.log(
      `  ✅ ${user.userEmail} (${roleName}) — set ${permissions.length} permission(s): ${permissions.join(", ")}`,
    );
    updated++;
  }

  console.log(`\nDone. ${updated} user(s) updated, ${skipped} skipped.`);
}

main()
  .catch((e) => {
    console.error("❌ Failed:", e.message);
  })
  .finally(() => prisma.$disconnect());

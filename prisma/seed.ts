import { prisma } from "../src/config/prisma";

async function main() {
  const roles = ["TENANT", "LANDLORD", "AGENT", "FACILITY_MANAGER", "ADMIN"];

  for (const roleName of roles) {
    const existingRole = await prisma.role.findUnique({
      where: { roleName },
    });

    if (!existingRole) {
      await prisma.role.create({
        data: { roleName },
      });
      console.log(`Created role: ${roleName}`);
    } else {
      console.log(`Role already exists: ${roleName}`);
    }
  }
}

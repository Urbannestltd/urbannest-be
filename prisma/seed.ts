// prisma/seed.ts
import {
  PrismaClient,
  UserStatus,
  UnitStatus,
  LeaseStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting Seeding Process...");

  // ==================================================
  // 1. CREATE ROLES
  // ==================================================
  console.log("...creating roles");
  const landlordRole = await prisma.role.upsert({
    where: { roleName: "LANDLORD" },
    update: {},
    create: { roleName: "LANDLORD", roleDescription: "Property Owner" },
  });

  const tenantRole = await prisma.role.upsert({
    where: { roleName: "TENANT" },
    update: {},
    create: { roleName: "TENANT", roleDescription: "Resident" },
  });

  // ==================================================
  // 2. CREATE USERS (Landlord & Tenant)
  // ==================================================
  console.log("...creating users");

  // Landlord: Chief Obi
  const landlord = await prisma.user.upsert({
    where: { userEmail: "obi@properties.ng" },
    update: {},
    create: {
      userEmail: "obi@properties.ng",
      userFullName: "Obinna Okafor",

      userPhone: "08012345678",
      userStatus: UserStatus.ACTIVE,
      userRoleId: landlordRole.roleId,
      userPassword: "hashed_password_here", // In real app, use bcrypt
    },
  });

  // Tenant: Tunde (Moving into Flat 1)
  const tenant1 = await prisma.user.upsert({
    where: { userEmail: "tunde@gmail.com" },
    update: {},
    create: {
      userEmail: "tunde@gmail.com",
      userFullName: "Tunde Adebayo",
      userPhone: "09098765432",
      userStatus: UserStatus.ACTIVE,
      userRoleId: tenantRole.roleId,
      userPassword: "hashed_password_here",
    },
  });

  // ==================================================
  // 3. CREATE PROPERTY (Lagos Context)
  // ==================================================
  console.log("...creating property");

  const property = await prisma.property.create({
    data: {
      name: "1004 Estate (Cluster C)",
      address: "Adetokunbo Ademola Street",
      city: "Victoria Island",
      state: "Lagos",
      zip: "101241",
      landlordId: landlord.userId,
      type: "MULTI_UNIT",

      // We can create units simultaneously using nested writes
      units: {
        create: [
          // Unit 1: Occupied by Tunde
          {
            name: "Block C4, Flat 401",
            bedrooms: 3,
            bathrooms: 2.5,
            status: UnitStatus.OCCUPIED,
          },
          // Unit 2: Currently Empty
          {
            name: "Block C4, Flat 402",
            bedrooms: 2,
            bathrooms: 2,
            status: UnitStatus.AVAILABLE,
          },
          // Unit 3: Penthouse
          {
            name: "Block C4, Penthouse",
            bedrooms: 4,
            bathrooms: 4,
            status: UnitStatus.AVAILABLE,
          },
        ],
      },
    },
  });

  // We need to fetch the units back to get their IDs for the lease
  const units = await prisma.unit.findMany({
    where: { propertyId: property.id },
  });
  const occupiedUnit = units.find((u) => u.name === "Block C4, Flat 401");

  if (!occupiedUnit) throw new Error("Unit creation failed");

  // ==================================================
  // 4. CREATE LEASE (Contract)
  // ==================================================
  console.log("...creating lease");

  // Create a lease starting 3 months ago (so it's currently active)
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 3);

  const endDate = new Date(startDate);
  endDate.setFullYear(endDate.getFullYear() + 1); // 1 Year Lease

  await prisma.lease.create({
    data: {
      tenantId: tenant1.userId,
      unitId: occupiedUnit.id,
      startDate: startDate,
      endDate: endDate,
      rentAmount: 4500000,
      status: LeaseStatus.ACTIVE,
      documentUrl:
        "https://mloqlcgzfhvdcetiesvt.supabase.co/storage/v1/object/sign/Urbannest/20CG028073_FYP-Final_2.pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9hZDFhM2I0YS02MTAyLTRlNjMtYjgzYi03MmQwMWJhMjcyODAiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJVcmJhbm5lc3QvMjBDRzAyODA3M19GWVAtRmluYWxfMi5wZGYiLCJpYXQiOjE3NjkxMzY2NzQsImV4cCI6MTc3MTcyODY3NH0.r0yMtOE2BawNOOK04_PnJLOBAg2Xxq5SORwtgnUwuWk",
    },
  });

  console.log("✅ Seeding Complete!");
  console.log(`Created Property: ${property.name} in ${property.city}`);
  console.log(
    `Created Lease for: ${tenant1?.userFullName?.split(" ")[0] ?? tenant1.userFirstName} in ${occupiedUnit.name}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

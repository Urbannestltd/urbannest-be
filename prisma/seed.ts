// prisma/seed.ts
import {
  PrismaClient,
  UserStatus,
  UnitStatus,
  LeaseStatus,
  PropertyType, // <-- Added PropertyType
} from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting Seeding Process...");

  const saltRounds = 10;
  const defaultPassword = await bcrypt.hash("Password1$", saltRounds);

  // ==================================================
  // 1. CREATE PRIVILEGES (PERMISSIONS)
  // ==================================================
  console.log("...creating privileges");

  const privileges = [
    { name: "PROPERTY_CREATE", desc: "Can create new properties" },
    { name: "PROPERTY_READ", desc: "Can view properties" },
    { name: "PROPERTY_UPDATE", desc: "Can edit property details" },
    { name: "PROPERTY_DELETE", desc: "Can delete properties" },
    { name: "UNIT_CREATE", desc: "Can create new units" },
    { name: "UNIT_READ", desc: "Can view units" },
    { name: "UNIT_UPDATE", desc: "Can edit unit details" },
    { name: "LEASE_MANAGE", desc: "Can create and update leases" },
    { name: "PAYMENT_VIEW", desc: "Can view payment ledgers" },
    { name: "PAYMENT_PROCESS", desc: "Can process or verify payments" },
    { name: "MAINTENANCE_VIEW", desc: "Can view maintenance requests" },
    {
      name: "MAINTENANCE_MANAGE",
      desc: "Can update and assign maintenance tickets",
    },
    {
      name: "SUPPORT_MANAGE",
      desc: "Can reply to and resolve support tickets",
    },
    { name: "VISITOR_INVITE", desc: "Can generate visitor access codes" },
    {
      name: "VISITOR_VERIFY",
      desc: "Can verify and check-in visitors at the gate",
    },
    { name: "USER_MANAGE", desc: "Can create, edit, or block users" },
    { name: "SYSTEM_CONFIG", desc: "Can modify system-wide settings" },
  ];

  for (const priv of privileges) {
    await prisma.privilege.upsert({
      where: { privilegeName: priv.name },
      update: {},
      create: {
        privilegeName: priv.name,
        privilegeDescription: priv.desc,
      },
    });
  }

  // ==================================================
  // 2. CREATE ROLES
  // ==================================================
  console.log("...creating roles");

  const roles = [
    { name: "ADMIN", desc: "System Administrator with full access" },
    { name: "LANDLORD", desc: "Property Owner" },
    { name: "TENANT", desc: "Resident" },
    { name: "VENDOR", desc: "Service Provider / Maintenance Worker" },
  ];

  // We no longer need the createdRoles dictionary!
  for (const roleData of roles) {
    await prisma.role.upsert({
      where: { roleName: roleData.name },
      update: {},
      create: { roleName: roleData.name, roleDescription: roleData.desc },
    });
  }

  // ==================================================
  // 3. CREATE USERS
  // ==================================================
  console.log("...creating users");

  // Admin User
  const adminEmail = "admin@urbannest.com";
  const adminUser = await prisma.user.upsert({
    where: { userEmail: adminEmail },
    update: {},
    create: {
      userEmail: adminEmail,
      userPassword: defaultPassword,
      userFirstName: "System",
      userFullName: "System Admin",
      userStatus: UserStatus.ACTIVE,
      // Fix: Use relational connect instead of a loose string
      userRole: { connect: { roleName: "ADMIN" } },
    },
  });

  // Landlord: Chief Obi
  const landlord = await prisma.user.upsert({
    where: { userEmail: "obi@properties.ng" },
    update: {},
    create: {
      userEmail: "obi@properties.ng",
      userFullName: "Obinna Okafor",
      userPhone: "08012345678",
      userStatus: UserStatus.ACTIVE,
      userPassword: defaultPassword,
      // Fix: Connect directly via the unique roleName
      userRole: { connect: { roleName: "LANDLORD" } },
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
      userPassword: defaultPassword,
      // Fix: Connect directly via the unique roleName
      userRole: { connect: { roleName: "TENANT" } },
    },
  });

  // ==================================================
  // 4. CREATE PROPERTY & UNITS (Lagos Context)
  // ==================================================
  console.log("...creating property and units");

  let property = await prisma.property.findFirst({
    where: { name: "1004 Estate (Cluster C)" },
  });

  if (!property) {
    property = await prisma.property.create({
      data: {
        name: "1004 Estate (Cluster C)",
        address: "Adetokunbo Ademola Street",
        city: "Victoria Island",
        state: "Lagos",
        zip: "101241",
        landlordId: landlord.userId,
        type: PropertyType.MULTI_UNIT, // Fix: Use Enum instead of raw string
        units: {
          create: [
            {
              name: "Block C4, Flat 401",
              bedrooms: 3,
              bathrooms: 2.5,
              status: UnitStatus.OCCUPIED,
            },
            {
              name: "Block C4, Flat 402",
              bedrooms: 2,
              bathrooms: 2,
              status: UnitStatus.AVAILABLE,
            },
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
  }

  const units = await prisma.unit.findMany({
    where: { propertyId: property.id },
  });
  const occupiedUnit = units.find((u) => u.name === "Block C4, Flat 401");

  if (!occupiedUnit) throw new Error("Unit creation failed or missing");

  // ==================================================
  // 5. CREATE LEASE (Contract)
  // ==================================================
  console.log("...creating lease");

  const existingLease = await prisma.lease.findFirst({
    where: { tenantId: tenant1.userId, unitId: occupiedUnit.id },
  });

  if (!existingLease) {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 3);

    const endDate = new Date(startDate);
    endDate.setFullYear(endDate.getFullYear() + 1);

    await prisma.lease.create({
      data: {
        tenantId: tenant1.userId,
        unitId: occupiedUnit.id,
        startDate: startDate,
        endDate: endDate,
        rentAmount: 4500000,
        status: LeaseStatus.ACTIVE,
        documentUrl:
          "https://mloqlcgzfhvdcetiesvt.supabase.co/storage/v1/object/sign/Urbannest/20CG028073_FYP-Final_2.pdf?token=...",
      },
    });
  }

  // ==================================================
  // FINISH
  // ==================================================
  console.log("==================================================");
  console.log("✅ Seeding Complete!");
  console.log(`🏢 Created Property: ${property.name} in ${property.city}`);
  console.log(`🔑 Admin Email: ${adminEmail} | Pass: Password1$`);
  console.log(`🔑 Landlord Email: obi@properties.ng | Pass: Password1$`);
  console.log(`🔑 Tenant Email: tunde@gmail.com | Pass: Password1$`);
  console.log("==================================================");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

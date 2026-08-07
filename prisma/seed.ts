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
    { name: "FACILITY_MANAGER", desc: "Manages property facilities and operations" },
    { name: "AGENT", desc: "Field agent who markets properties and manages leads" },
    { name: "FRONT_DESK", desc: "Approves and checks in tenant visitors at the front desk" },
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

  // Facility Manager: Jonathan Doe
  const facilityManager = await prisma.user.upsert({
    where: { userEmail: "jonathan@urbannest.com" },
    update: {},
    create: {
      userEmail: "jonathan@urbannest.com",
      userFullName: "Jonathan Doe",
      userPhone: "08012345678",
      userStatus: UserStatus.ACTIVE,
      userPassword: defaultPassword,
      // Fix: Connect directly via the unique roleName
      userRole: { connect: { roleName: "FACILITY_MANAGER" } },
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

  // Agent: Amaka Nwosu
  const agent = await prisma.user.upsert({
    where: { userEmail: "amaka@urbannest.com" },
    update: {},
    create: {
      userEmail: "amaka@urbannest.com",
      userFullName: "Amaka Nwosu",
      userPhone: "08023456789",
      userStatus: UserStatus.ACTIVE,
      userPassword: defaultPassword,
      userRole: { connect: { roleName: "AGENT" } },
    },
  });

  // Front Desk: Chidinma Eze
  const frontDesk = await prisma.user.upsert({
    where: { userEmail: "chidinma@urbannest.com" },
    update: {},
    create: {
      userEmail: "chidinma@urbannest.com",
      userFullName: "Chidinma Eze",
      userPhone: "08034567890",
      userStatus: UserStatus.ACTIVE,
      userPassword: defaultPassword,
      userRole: { connect: { roleName: "FRONT_DESK" } },
    },
  });

  // ==================================================
  // 4. CREATE PROPERTY & UNITS (Lagos Context)
  // ==================================================
  console.log("...creating property and units");

  let property = await prisma.property.findFirst({
    where: { name: "1004 Estate (Cluster C)" },
  });

  if (property) {
    property = await prisma.property.update({
      where: { id: property.id },
      data: {
        facilityManagerId: facilityManager.userId,
        agentId: agent.userId,
        frontDeskId: frontDesk.userId,
        price: property.price ?? 4500000,
        amenities: property.amenities.length
          ? property.amenities
          : ["24/7 Power", "Swimming Pool", "Gym", "Secure Parking"],
      },
    });
  } else {
    property = await prisma.property.create({
      data: {
        name: "1004 Estate (Cluster C)",
        address: "Adetokunbo Ademola Street",
        city: "Victoria Island",
        state: "Lagos",
        zip: "101241",
        landlordId: landlord.userId,
        type: PropertyType.MULTI_UNIT, // Fix: Use Enum instead of raw string
        facilityManagerId: facilityManager.userId,
        agentId: agent.userId,
        frontDeskId: frontDesk.userId,
        price: 4500000,
        amenities: ["24/7 Power", "Swimming Pool", "Gym", "Secure Parking"],
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
  // 6. CREATE AGENT LEADS (Sample Pipeline)
  // ==================================================
  console.log("...creating agent leads");

  const availableUnit = units.find((u) => u.name === "Block C4, Flat 402");

  const existingDraftLead = await prisma.agentLead.findFirst({
    where: { agentId: agent.userId, prospectName: "Chidi Okafor" },
  });
  if (!existingDraftLead) {
    await prisma.agentLead.create({
      data: {
        agentId: agent.userId,
        propertyId: property.id,
        unitId: availableUnit?.id,
        prospectName: "Chidi Okafor",
        prospectEmail: "chidi.okafor@example.com",
        prospectPhone: "08034567890",
        proposedRent: 4500000,
        status: "PENDING",
      },
    });
  }

  const existingForwardedLead = await prisma.agentLead.findFirst({
    where: { agentId: agent.userId, prospectName: "Ngozi Umeh" },
  });
  if (!existingForwardedLead) {
    await prisma.agentLead.create({
      data: {
        agentId: agent.userId,
        propertyId: property.id,
        unitId: availableUnit?.id,
        prospectName: "Ngozi Umeh",
        prospectEmail: "ngozi.umeh@example.com",
        prospectPhone: "08045678901",
        proposedRent: 4500000,
        status: "FORWARDED_TO_LANDLORD",
      },
    });
  }

  // ==================================================
  // 7. SECOND COHORT — a fully separate admin/landlord/FM/agent/tenant,
  //    with their own property + units, isolated from the first cohort above.
  // ==================================================
  console.log("...creating second cohort (admin2/landlord2/fm2/agent2/tenant2)");

  const admin2 = await prisma.user.upsert({
    where: { userEmail: "admin2@urbannest.com" },
    update: {},
    create: {
      userEmail: "admin2@urbannest.com",
      userFullName: "Ijeoma Balogun",
      userPhone: "08056781234",
      userStatus: UserStatus.ACTIVE,
      userPassword: defaultPassword,
      userRole: { connect: { roleName: "ADMIN" } },
    },
  });

  const facilityManager2 = await prisma.user.upsert({
    where: { userEmail: "fm2@urbannest.com" },
    update: {},
    create: {
      userEmail: "fm2@urbannest.com",
      userFullName: "Tunji Bakare",
      userPhone: "08067892345",
      userStatus: UserStatus.ACTIVE,
      userPassword: defaultPassword,
      userRole: { connect: { roleName: "FACILITY_MANAGER" } },
    },
  });

  const landlord2 = await prisma.user.upsert({
    where: { userEmail: "landlord2@properties.ng" },
    update: {},
    create: {
      userEmail: "landlord2@properties.ng",
      userFullName: "Chidinma Eze",
      userPhone: "08078903456",
      userStatus: UserStatus.ACTIVE,
      userPassword: defaultPassword,
      userRole: { connect: { roleName: "LANDLORD" } },
    },
  });

  const agent2 = await prisma.user.upsert({
    where: { userEmail: "agent2@urbannest.com" },
    update: {},
    create: {
      userEmail: "agent2@urbannest.com",
      userFullName: "Segun Adeyemi",
      userPhone: "08089014567",
      userStatus: UserStatus.ACTIVE,
      userPassword: defaultPassword,
      userRole: { connect: { roleName: "AGENT" } },
    },
  });

  const tenant2 = await prisma.user.upsert({
    where: { userEmail: "tenant2@gmail.com" },
    update: {},
    create: {
      userEmail: "tenant2@gmail.com",
      userFullName: "Blessing Nwachukwu",
      userPhone: "08090125678",
      userStatus: UserStatus.ACTIVE,
      userPassword: defaultPassword,
      userRole: { connect: { roleName: "TENANT" } },
    },
  });

  let property2 = await prisma.property.findFirst({
    where: { name: "Palmview Residences" },
  });

  if (property2) {
    property2 = await prisma.property.update({
      where: { id: property2.id },
      data: {
        facilityManagerId: facilityManager2.userId,
        agentId: agent2.userId,
        landlordId: landlord2.userId,
        price: property2.price ?? 3200000,
        amenities: property2.amenities.length
          ? property2.amenities
          : ["Backup Generator", "CCTV", "Borehole Water"],
      },
    });
  } else {
    property2 = await prisma.property.create({
      data: {
        name: "Palmview Residences",
        address: "12 Admiralty Way",
        city: "Lekki Phase 1",
        state: "Lagos",
        zip: "106104",
        landlordId: landlord2.userId,
        type: PropertyType.MULTI_UNIT,
        facilityManagerId: facilityManager2.userId,
        agentId: agent2.userId,
        price: 3200000,
        amenities: ["Backup Generator", "CCTV", "Borehole Water"],
        units: {
          create: [
            {
              name: "Block A, Flat 1",
              bedrooms: 2,
              bathrooms: 2,
              status: UnitStatus.OCCUPIED,
            },
            {
              name: "Block A, Flat 2",
              bedrooms: 2,
              bathrooms: 2,
              status: UnitStatus.AVAILABLE,
            },
            {
              name: "Block A, Flat 3",
              bedrooms: 3,
              bathrooms: 2.5,
              status: UnitStatus.AVAILABLE,
            },
          ],
        },
      },
    });
  }

  const units2 = await prisma.unit.findMany({
    where: { propertyId: property2.id },
  });
  const occupiedUnit2 = units2.find((u) => u.name === "Block A, Flat 1");

  if (!occupiedUnit2) throw new Error("Second cohort unit creation failed or missing");

  console.log("...creating second cohort lease");

  const existingLease2 = await prisma.lease.findFirst({
    where: { tenantId: tenant2.userId, unitId: occupiedUnit2.id },
  });

  if (!existingLease2) {
    const startDate2 = new Date();
    startDate2.setMonth(startDate2.getMonth() - 1);

    const endDate2 = new Date(startDate2);
    endDate2.setFullYear(endDate2.getFullYear() + 1);

    await prisma.lease.create({
      data: {
        tenantId: tenant2.userId,
        unitId: occupiedUnit2.id,
        startDate: startDate2,
        endDate: endDate2,
        rentAmount: 3200000,
        status: LeaseStatus.ACTIVE,
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
  console.log(`🔑 Agent Email: amaka@urbannest.com | Pass: Password1$`);
  console.log(`🔑 Front Desk Email: chidinma@urbannest.com | Pass: Password1$`);
  console.log("--------------------------------------------------");
  console.log(`🏢 Created Property: ${property2.name} in ${property2.city}`);
  console.log(`🔑 Admin 2 Email: admin2@urbannest.com | Pass: Password1$`);
  console.log(`🔑 Landlord 2 Email: landlord2@properties.ng | Pass: Password1$`);
  console.log(`🔑 Facility Manager 2 Email: fm2@urbannest.com | Pass: Password1$`);
  console.log(`🔑 Agent 2 Email: agent2@urbannest.com | Pass: Password1$`);
  console.log(`🔑 Tenant 2 Email: tenant2@gmail.com | Pass: Password1$`);
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

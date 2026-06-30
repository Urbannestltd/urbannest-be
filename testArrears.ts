import { PrismaClient } from "@prisma/client";
import axios from "axios";

const prisma = new PrismaClient();

interface TestConfig {
  landlordId: string;
  propertyId: string;
  unitId: string;
  tenantId: string;
  leaseId: string;
  apiUrl: string;
  jwtToken: string;
}

async function setupTestData(): Promise<TestConfig> {
  console.log("📋 Setting up test data for Jonathan's property...\n");

  // 1. Find Obinna Okafor (landlord whose property is managed by Jonathan)
  let landlord = await prisma.user.findFirst({
    where: {
      userEmail: "obi@properties.ng",
      isDeleted: false,
    },
  });

  if (!landlord) {
    console.log("❌ Landlord 'Obinna Okafor' not found. Available landlords:");
    const landlords = await prisma.user.findMany({
      where: {
        userRole: { roleName: "LANDLORD" },
        isDeleted: false,
      },
      select: { userId: true, userFullName: true, userEmail: true },
    });
    landlords.forEach(l => console.log(`   - ${l.userFullName} (${l.userEmail})`));
    throw new Error("Landlord not found in database.");
  }
  console.log(`✓ Found landlord: ${landlord.userFullName} (${landlord.userEmail})`);

  // 2. Find the 1004 Estate property
  let property = await prisma.property.findFirst({
    where: {
      landlordId: landlord.userId,
      isDeleted: false,
      name: "1004 Estate (Cluster C)",
    },
  });

  if (!property) {
    console.log("❌ Property '1004 Estate (Cluster C)' not found for this landlord.");
    const props = await prisma.property.findMany({
      where: { landlordId: landlord.userId, isDeleted: false },
      select: { id: true, name: true },
    });
    if (props.length) {
      console.log("Available properties:");
      props.forEach(p => console.log(`   - ${p.name}`));
    }
    throw new Error("Property not found.");
  }
  console.log(`✓ Found property: ${property.name} (${property.id})`);

  // 3. Find or create a unit in this property
  let unit = await prisma.unit.findFirst({
    where: { propertyId: property.id },
  });

  if (!unit) {
    unit = await prisma.unit.create({
      data: {
        propertyId: property.id,
        name: "Test Unit",
        bedrooms: 2,
        bathrooms: 1,
        baseRent: 500000,
      },
    });
    console.log(`✓ Created unit: ${unit.name} (${unit.id})`);
  } else {
    console.log(`✓ Found unit: ${unit.name} (${unit.id})`);
  }

  // 4. Find or use Tunde (test tenant from seed)
  let tenant = await prisma.user.findFirst({
    where: { userEmail: "tunde@gmail.com", isDeleted: false },
  });

  if (!tenant) {
    throw new Error("Test tenant (Tunde) not found. Please run seed first.");
  }
  console.log(`✓ Found tenant: ${tenant.userFullName} (${tenant.userId})`);

  // 5. Find or create an active lease
  let lease = await prisma.lease.findFirst({
    where: { unitId: unit.id, status: "ACTIVE" },
  });

  if (!lease) {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 2);
    const endDate = new Date(startDate);
    endDate.setFullYear(endDate.getFullYear() + 1);

    lease = await prisma.lease.create({
      data: {
        tenantId: tenant.userId,
        unitId: unit.id,
        startDate,
        endDate,
        rentAmount: 500000,
        status: "ACTIVE",
      },
    });
    console.log(`✓ Created lease: ${lease.id}`);
  } else {
    console.log(`✓ Found lease: ${lease.id}`);
  }

  // 6. Create overdue and pending payments
  console.log("\n📝 Creating test payments...");

  // Delete old test payments first
  await prisma.payment.deleteMany({
    where: {
      leaseId: lease.id,
      reference: { contains: "TEST_ARREARS" },
    },
  });

  // Create OVERDUE payment (30 days past due)
  const overdueDate = new Date();
  overdueDate.setDate(overdueDate.getDate() - 30);

  const overduePayment = await prisma.payment.create({
    data: {
      leaseId: lease.id,
      userId: tenant.userId,
      type: "RENT",
      status: "OVERDUE",
      amount: 500000,
      dueDate: overdueDate,
      reference: "TEST_ARREARS_OVERDUE",
      createdAt: overdueDate,
    },
  });
  console.log(`✓ Created OVERDUE payment: ₦${overduePayment.amount} (due ${overdueDate.toISOString().split('T')[0]})`);

  // Create PENDING payment (5 days in future)
  const pendingDate = new Date();
  pendingDate.setDate(pendingDate.getDate() + 5);

  const pendingPayment = await prisma.payment.create({
    data: {
      leaseId: lease.id,
      userId: tenant.userId,
      type: "RENT",
      status: "PENDING",
      amount: 250000,
      dueDate: pendingDate,
      reference: "TEST_ARREARS_PENDING",
      createdAt: new Date(),
    },
  });
  console.log(`✓ Created PENDING payment: ₦${pendingPayment.amount} (due ${pendingDate.toISOString().split('T')[0]})`);

  return {
    landlordId: landlord.userId,
    propertyId: property.id,
    unitId: unit.id,
    tenantId: tenant.userId,
    leaseId: lease.id,
    apiUrl: process.env.API_URL || "http://localhost:3000",
    jwtToken: process.env.JWT_TOKEN || "",
  };
}

async function testArrearsEndpoint(config: TestConfig) {
  console.log("\n🌐 Testing arrears endpoint...\n");

  if (!config.jwtToken) {
    console.log("⚠️  JWT_TOKEN environment variable not set.");
    console.log("   Set it and rerun: JWT_TOKEN=<your_token> npx ts-node testArrears.ts");
    console.log(`   Or manually test: GET ${config.apiUrl}/landlord/financials/arrears`);
    return;
  }

  try {
    const response = await axios.get(`${config.apiUrl}/landlord/financials/arrears`, {
      headers: {
        Authorization: `Bearer ${config.jwtToken}`,
        "Content-Type": "application/json",
      },
    });

    console.log("✅ Response received:");
    console.log(JSON.stringify(response.data, null, 2));

    const arrears = response.data.data || [];
    if (arrears.length > 0) {
      console.log(`\n📊 Found ${arrears.length} arrear item(s):`);
      arrears.forEach((item: any, idx: number) => {
        console.log(`\n  [${idx + 1}] Tenant: ${item.tenantName}`);
        console.log(`      Property: ${item.propertyName}`);
        console.log(`      Unit: ${item.unitName}`);
        console.log(`      Balance Due: ₦${item.balanceDue.toLocaleString()}`);
        console.log(`      Days Overdue: ${item.daysOverdue}`);
      });
    } else {
      console.log("ℹ️  No arrears found");
    }
  } catch (error: any) {
    console.error("❌ API call failed:");
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data: ${JSON.stringify(error.response.data)}`);
    } else {
      console.error(`   Error: ${error.message}`);
    }
  }
}

async function main() {
  try {
    console.log("========================================");
    console.log("   Landlord Arrears Testing Script");
    console.log("========================================\n");

    const config = await setupTestData();

    console.log("\n" + "=".repeat(40));
    console.log("Test Configuration:");
    console.log("=".repeat(40));
    console.log(`Landlord ID: ${config.landlordId}`);
    console.log(`Property ID: ${config.propertyId}`);
    console.log(`Unit ID: ${config.unitId}`);
    console.log(`Lease ID: ${config.leaseId}`);
    console.log(`API URL: ${config.apiUrl}`);
    console.log(`JWT Token: ${config.jwtToken ? "✓ Set" : "✗ Not set"}`);

    await testArrearsEndpoint(config);

    console.log("\n✨ Test complete!");
  } catch (error) {
    console.error("❌ Error:", error instanceof Error ? error.message : error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

jest.mock("../../config/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    lease: { findFirst: jest.fn() },
    utilityProfile: { findFirst: jest.fn(), create: jest.fn() },
    payment: { create: jest.fn() },
  },
}));

jest.mock("../../utils/paystackClient", () => ({
  paystackClient: {
    post: jest.fn().mockResolvedValue({
      data: { data: { authorization_url: "https://paystack.test/pay", reference: "ref" } },
    }),
  },
}));

jest.mock("../external/vtPassService", () => ({
  VTPassService: jest.fn().mockImplementation(() => ({})),
}));

import { UtilityService } from "./utilityService";
import { prisma } from "../../config/prisma";

const mockedPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  lease: { findFirst: jest.Mock };
  utilityProfile: { findFirst: jest.Mock; create: jest.Mock };
  payment: { create: jest.Mock };
};

const purchaseParams = {
  serviceID: "ikeja-electric",
  type: "prepaid",
  meterNumber: "12345678",
  amount: 5000,
};

describe("UtilityService.initiatePurchase — payment attribution", () => {
  let service: UtilityService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UtilityService();
    mockedPrisma.user.findUnique.mockResolvedValue({
      userId: "tenant-1",
      userEmail: "tenant@example.com",
      userPhone: "08000000000",
    });
    mockedPrisma.payment.create.mockResolvedValue({});
  });

  it("attaches the tenant's active lease to the payment, so admin financials can resolve property/unit", async () => {
    mockedPrisma.lease.findFirst.mockResolvedValue({ id: "lease-1" });

    await service.initiatePurchase("tenant-1", purchaseParams);

    expect(mockedPrisma.lease.findFirst).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", status: "ACTIVE" },
    });
    expect(mockedPrisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ leaseId: "lease-1" }),
      }),
    );
  });

  it("still creates the payment (with a null leaseId) when the tenant has no active lease", async () => {
    mockedPrisma.lease.findFirst.mockResolvedValue(null);

    await service.initiatePurchase("tenant-1", purchaseParams);

    expect(mockedPrisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ leaseId: null }),
      }),
    );
  });
});

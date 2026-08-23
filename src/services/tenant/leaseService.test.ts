jest.mock("../../config/prisma", () => ({
  prisma: {
    lease: { findUnique: jest.fn(), findFirst: jest.fn() },
  },
}));

import { LeaseService } from "./leaseService";
import { prisma } from "../../config/prisma";
import { NotFoundError } from "../../utils/apiError";

const mockedPrisma = prisma as unknown as {
  lease: { findUnique: jest.Mock; findFirst: jest.Mock };
};

const LEASE_ID = "lease-1";
const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";

describe("LeaseService — cross-tenant access (BOLA)", () => {
  let service: LeaseService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LeaseService();
  });

  it("getLeaseDownloadUrl: tenant B requesting tenant A's lease gets 404", async () => {
    mockedPrisma.lease.findUnique.mockResolvedValue({
      tenantId: TENANT_A,
      documentUrl: "https://example.com/doc.pdf",
    });

    await expect(service.getLeaseDownloadUrl(LEASE_ID, TENANT_B)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("getLeaseDownloadUrl: the actual owner gets the URL", async () => {
    mockedPrisma.lease.findUnique.mockResolvedValue({
      tenantId: TENANT_A,
      documentUrl: "https://example.com/doc.pdf",
    });

    await expect(service.getLeaseDownloadUrl(LEASE_ID, TENANT_A)).resolves.toEqual({
      url: "https://example.com/doc.pdf",
    });
  });

  it("getLeaseDownloadUrl: a non-existent leaseId also gets 404", async () => {
    mockedPrisma.lease.findUnique.mockResolvedValue(null);

    await expect(service.getLeaseDownloadUrl(LEASE_ID, TENANT_A)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

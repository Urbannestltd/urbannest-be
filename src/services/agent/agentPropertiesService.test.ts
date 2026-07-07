import { AgentPropertiesService } from "./agentPropertiesService";

jest.mock("../../config/prisma", () => ({
  prisma: {
    property: { findMany: jest.fn() },
  },
}));

import { prisma } from "../../config/prisma";

const mockedPrisma = prisma as unknown as {
  property: { findMany: jest.Mock };
};

describe("AgentPropertiesService", () => {
  const agentId = "agent-1";
  let service: AgentPropertiesService;

  const baseProperty = (overrides: Partial<any> = {}) => ({
    id: "p1",
    name: "Zephyr Towers",
    type: "MULTI_UNIT",
    address: "12 Marina Rd",
    createdAt: new Date(2026, 0, 1),
    units: [{ status: "AVAILABLE" }, { status: "OCCUPIED" }],
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AgentPropertiesService();
  });

  it("scopes the query to the logged-in agent and non-deleted properties", async () => {
    mockedPrisma.property.findMany.mockResolvedValue([]);

    await service.getAssignedProperties(agentId, { availability: "ALL" });

    expect(mockedPrisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ agentId, isDeleted: false }),
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("passes a case-insensitive name search filter to Prisma when search is provided", async () => {
    mockedPrisma.property.findMany.mockResolvedValue([]);

    await service.getAssignedProperties(agentId, { search: "zephyr", availability: "ALL" });

    expect(mockedPrisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          name: { contains: "zephyr", mode: "insensitive" },
        }),
      }),
    );
  });

  it("computes availabilityStatus, totalUnitCount and availableUnitCount per property", async () => {
    mockedPrisma.property.findMany.mockResolvedValue([
      baseProperty({ units: [{ status: "AVAILABLE" }, { status: "AVAILABLE" }, { status: "OCCUPIED" }] }),
      baseProperty({ id: "p2", units: [{ status: "OCCUPIED" }, { status: "OCCUPIED" }] }),
    ]);

    const result = await service.getAssignedProperties(agentId, { availability: "ALL" });

    expect(result).toEqual([
      expect.objectContaining({
        propertyId: "p1",
        totalUnitCount: 3,
        availableUnitCount: 2,
        availabilityStatus: "AVAILABLE",
      }),
      expect.objectContaining({
        propertyId: "p2",
        totalUnitCount: 2,
        availableUnitCount: 0,
        availabilityStatus: "FULLY_OCCUPIED",
      }),
    ]);
  });

  it("filters to only properties with available units when availability=AVAILABLE", async () => {
    mockedPrisma.property.findMany.mockResolvedValue([
      baseProperty({ id: "p1", units: [{ status: "AVAILABLE" }] }),
      baseProperty({ id: "p2", units: [{ status: "OCCUPIED" }] }),
    ]);

    const result = await service.getAssignedProperties(agentId, { availability: "AVAILABLE" });

    expect(result.map((r) => r.propertyId)).toEqual(["p1"]);
  });

  it("filters to only fully occupied properties when availability=FULLY_OCCUPIED", async () => {
    mockedPrisma.property.findMany.mockResolvedValue([
      baseProperty({ id: "p1", units: [{ status: "AVAILABLE" }] }),
      baseProperty({ id: "p2", units: [{ status: "OCCUPIED" }] }),
    ]);

    const result = await service.getAssignedProperties(agentId, { availability: "FULLY_OCCUPIED" });

    expect(result.map((r) => r.propertyId)).toEqual(["p2"]);
  });

  it("combines search and availability filters", async () => {
    mockedPrisma.property.findMany.mockResolvedValue([
      baseProperty({ id: "p1", name: "Zephyr Towers", units: [{ status: "AVAILABLE" }] }),
    ]);

    const result = await service.getAssignedProperties(agentId, {
      search: "zephyr",
      availability: "AVAILABLE",
    });

    expect(mockedPrisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          name: { contains: "zephyr", mode: "insensitive" },
        }),
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.propertyId).toBe("p1");
  });

  it("returns an empty array when the agent has no assigned properties (empty state)", async () => {
    mockedPrisma.property.findMany.mockResolvedValue([]);

    const result = await service.getAssignedProperties(agentId, { availability: "ALL" });

    expect(result).toEqual([]);
  });

  it("returns an empty array when a search/filter combination matches nothing (no results state)", async () => {
    mockedPrisma.property.findMany.mockResolvedValue([
      baseProperty({ id: "p1", units: [{ status: "OCCUPIED" }] }),
    ]);

    const result = await service.getAssignedProperties(agentId, {
      search: "nonexistent",
      availability: "AVAILABLE",
    });

    expect(result).toEqual([]);
  });

  it("preserves the recently-added order returned by Prisma (createdAt desc)", async () => {
    mockedPrisma.property.findMany.mockResolvedValue([
      baseProperty({ id: "newer", createdAt: new Date(2026, 5, 1) }),
      baseProperty({ id: "older", createdAt: new Date(2026, 0, 1) }),
    ]);

    const result = await service.getAssignedProperties(agentId, { availability: "ALL" });

    expect(result.map((r) => r.propertyId)).toEqual(["newer", "older"]);
  });
});

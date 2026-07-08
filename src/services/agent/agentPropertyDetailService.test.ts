import { AgentPropertyDetailService } from "./agentPropertyDetailService";

jest.mock("../../config/prisma", () => ({
  prisma: {
    property: { findFirst: jest.fn() },
    unit: { findMany: jest.fn() },
  },
}));

jest.mock("../../utils/activityLogger", () => ({
  logActivity: jest.fn(),
}));

import { prisma } from "../../config/prisma";
import { logActivity } from "../../utils/activityLogger";

const mockedPrisma = prisma as unknown as {
  property: { findFirst: jest.Mock };
  unit: { findMany: jest.Mock };
};
const mockedLogActivity = logActivity as jest.Mock;

describe("AgentPropertyDetailService", () => {
  const agentId = "agent-1";
  const propertyId = "prop-1";
  let service: AgentPropertyDetailService;

  const baseProperty = (overrides: Partial<any> = {}) => ({
    id: propertyId,
    name: "Zephyr Towers",
    type: "MULTI_UNIT",
    address: "12 Marina Rd",
    price: 500000,
    amenities: ["24/7 Power", "Gym"],
    images: ["https://storage.example.com/props/zephyr/photo1.jpg"],
    updatedAt: new Date(2026, 5, 28),
    agentId,
    units: [{ floor: "Floor 1" }, { floor: "Floor 1" }, { floor: "Floor 2" }],
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AgentPropertyDetailService();
  });

  describe("getPropertyDetail", () => {
    it("returns full detail with computed metrics for an assigned property", async () => {
      mockedPrisma.property.findFirst.mockResolvedValue(baseProperty());

      const result = await service.getPropertyDetail(agentId, propertyId);

      expect(result).toEqual({
        propertyId,
        propertyName: "Zephyr Towers",
        propertyType: "MULTI_UNIT",
        address: "12 Marina Rd",
        rent: 500000,
        noOfUnits: 3,
        noOfFloors: 2,
        lastUpdated: new Date(2026, 5, 28),
        media: [{ url: "https://storage.example.com/props/zephyr/photo1.jpg", fileName: "photo1.jpg" }],
        amenities: ["24/7 Power", "Gym"],
      });
    });

    it("throws 403 (ForbiddenError) when the property is not assigned to this agent", async () => {
      mockedPrisma.property.findFirst.mockResolvedValue(baseProperty({ agentId: "someone-else" }));

      await expect(service.getPropertyDetail(agentId, propertyId)).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it("throws 403 (ForbiddenError) when the property does not exist", async () => {
      mockedPrisma.property.findFirst.mockResolvedValue(null);

      await expect(service.getPropertyDetail(agentId, propertyId)).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it("returns an empty media array when no images exist", async () => {
      mockedPrisma.property.findFirst.mockResolvedValue(baseProperty({ images: [] }));

      const result = await service.getPropertyDetail(agentId, propertyId);

      expect(result.media).toEqual([]);
    });

    it("returns an empty amenities array when no amenities exist", async () => {
      mockedPrisma.property.findFirst.mockResolvedValue(baseProperty({ amenities: [] }));

      const result = await service.getPropertyDetail(agentId, propertyId);

      expect(result.amenities).toEqual([]);
    });

    it("counts distinct floors correctly when units share a floor", async () => {
      mockedPrisma.property.findFirst.mockResolvedValue(
        baseProperty({ units: [{ floor: "1" }, { floor: "Floor 1" }, { floor: null }] }),
      );

      const result = await service.getPropertyDetail(agentId, propertyId);

      // "1" and "Floor 1" normalize to the same bucket; null normalizes to "Unassigned"
      expect(result.noOfFloors).toBe(2);
      expect(result.noOfUnits).toBe(3);
    });

    it("falls back to the full url as fileName when the last path segment has no extension", async () => {
      mockedPrisma.property.findFirst.mockResolvedValue(
        baseProperty({ images: ["https://picsum.photos/seed/marina1/800/600"] }),
      );

      const result = await service.getPropertyDetail(agentId, propertyId);

      expect(result.media).toEqual([
        { url: "https://picsum.photos/seed/marina1/800/600", fileName: "https://picsum.photos/seed/marina1/800/600" },
      ]);
    });
  });

  describe("getMediaDownloadUrl", () => {
    it("validates ownership, validates the url belongs to the property, logs activity, and returns the url", async () => {
      const url = "https://storage.example.com/props/zephyr/photo1.jpg";
      mockedPrisma.property.findFirst.mockResolvedValue(baseProperty({ images: [url] }));

      const result = await service.getMediaDownloadUrl(agentId, propertyId, url);

      expect(result).toEqual({ url });
      expect(mockedLogActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: agentId,
          action: "AGENT_PROPERTY_MEDIA_DOWNLOADED",
          metadata: { propertyId, url },
        }),
      );
    });

    it("throws 403 when the url does not belong to the property", async () => {
      mockedPrisma.property.findFirst.mockResolvedValue(
        baseProperty({ images: ["https://storage.example.com/props/zephyr/photo1.jpg"] }),
      );

      await expect(
        service.getMediaDownloadUrl(agentId, propertyId, "https://storage.example.com/other/photo.jpg"),
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(mockedLogActivity).not.toHaveBeenCalled();
    });

    it("throws 403 when the agent's assignment to the property has been revoked", async () => {
      const url = "https://storage.example.com/props/zephyr/photo1.jpg";
      mockedPrisma.property.findFirst.mockResolvedValue(
        baseProperty({ agentId: "someone-else", images: [url] }),
      );

      await expect(service.getMediaDownloadUrl(agentId, propertyId, url)).rejects.toMatchObject({
        statusCode: 403,
      });
      expect(mockedLogActivity).not.toHaveBeenCalled();
    });
  });

  describe("getVacantUnits", () => {
    it("returns only AVAILABLE units for the property, scoped to the agent", async () => {
      mockedPrisma.property.findFirst.mockResolvedValue(baseProperty());
      mockedPrisma.unit.findMany.mockResolvedValue([
        { id: "unit-1", name: "A3" },
        { id: "unit-2", name: "B1" },
      ]);

      const result = await service.getVacantUnits(agentId, propertyId);

      expect(mockedPrisma.unit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { propertyId, status: "AVAILABLE" } }),
      );
      expect(result).toEqual([
        { unitId: "unit-1", unitName: "A3" },
        { unitId: "unit-2", unitName: "B1" },
      ]);
    });

    it("returns an empty array when the property has no vacant units", async () => {
      mockedPrisma.property.findFirst.mockResolvedValue(baseProperty());
      mockedPrisma.unit.findMany.mockResolvedValue([]);

      const result = await service.getVacantUnits(agentId, propertyId);

      expect(result).toEqual([]);
    });

    it("throws 403 when the agent is not assigned to the property", async () => {
      mockedPrisma.property.findFirst.mockResolvedValue(baseProperty({ agentId: "someone-else" }));

      await expect(service.getVacantUnits(agentId, propertyId)).rejects.toMatchObject({
        statusCode: 403,
      });
      expect(mockedPrisma.unit.findMany).not.toHaveBeenCalled();
    });
  });
});

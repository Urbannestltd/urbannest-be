import { AgentLeadsService } from "./agentLeadsService";

jest.mock("../../config/prisma", () => ({
  prisma: {
    agentLead: { findMany: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
  },
}));

jest.mock("../../utils/activityLogger", () => ({
  logActivity: jest.fn(),
}));

import { prisma } from "../../config/prisma";
import { logActivity } from "../../utils/activityLogger";

const mockedPrisma = prisma as unknown as {
  agentLead: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    delete: jest.Mock;
  };
};
const mockedLogActivity = logActivity as jest.Mock;

describe("AgentLeadsService", () => {
  const agentId = "agent-1";
  let service: AgentLeadsService;

  const rawLead = (overrides: Partial<any> = {}) => ({
    id: "lead-1",
    prospectName: "Chidi Okafor",
    status: "FORWARDED_TO_LANDLORD",
    createdAt: new Date(2026, 5, 1),
    property: { name: "Zephyr Towers" },
    unit: { name: "Unit 4B" },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AgentLeadsService();
  });

  describe("getLeads", () => {
    it("scopes to the logged-in agent and sorts newest first", async () => {
      mockedPrisma.agentLead.findMany.mockResolvedValue([]);

      await service.getLeads(agentId, { status: "ALL" });

      expect(mockedPrisma.agentLead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ agentId }),
          orderBy: { createdAt: "desc" },
        }),
      );
    });

    it("maps DB fields to the list item shape", async () => {
      mockedPrisma.agentLead.findMany.mockResolvedValue([rawLead()]);

      const result = await service.getLeads(agentId, { status: "ALL" });

      expect(result).toEqual([
        {
          leadId: "lead-1",
          prospectName: "Chidi Okafor",
          propertyName: "Zephyr Towers",
          unitNumber: "Unit 4B",
          status: "FORWARDED_TO_LANDLORD",
          dateAdded: rawLead().createdAt,
        },
      ]);
    });

    it("returns null unitNumber when the lead has no unit", async () => {
      mockedPrisma.agentLead.findMany.mockResolvedValue([rawLead({ unit: null })]);

      const result = await service.getLeads(agentId, { status: "ALL" });

      expect(result[0]!.unitNumber).toBeNull();
    });

    it("passes a case-insensitive prospect name search filter", async () => {
      mockedPrisma.agentLead.findMany.mockResolvedValue([]);

      await service.getLeads(agentId, { search: "chidi", status: "ALL" });

      expect(mockedPrisma.agentLead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            prospectName: { contains: "chidi", mode: "insensitive" },
          }),
        }),
      );
    });

    it.each([
      ["DRAFT", "PENDING"],
      ["FORWARDED", "FORWARDED_TO_LANDLORD"],
      ["APPROVED", "APPROVED"],
      ["REJECTED", "REJECTED"],
    ])("maps status filter %s to internal status %s", async (filterStatus, internalStatus) => {
      mockedPrisma.agentLead.findMany.mockResolvedValue([]);

      await service.getLeads(agentId, { status: filterStatus as any });

      expect(mockedPrisma.agentLead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: internalStatus }),
        }),
      );
    });

    it("does not filter by status when status=ALL", async () => {
      mockedPrisma.agentLead.findMany.mockResolvedValue([]);

      await service.getLeads(agentId, { status: "ALL" });

      const callArgs = mockedPrisma.agentLead.findMany.mock.calls[0]![0];
      expect(callArgs.where).not.toHaveProperty("status");
    });

    it("filters by propertyId when provided", async () => {
      mockedPrisma.agentLead.findMany.mockResolvedValue([]);

      await service.getLeads(agentId, { status: "ALL", propertyId: "prop-1" });

      expect(mockedPrisma.agentLead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ propertyId: "prop-1" }),
        }),
      );
    });

    it("combines search, status, and propertyId filters", async () => {
      mockedPrisma.agentLead.findMany.mockResolvedValue([]);

      await service.getLeads(agentId, {
        search: "chidi",
        status: "REJECTED",
        propertyId: "prop-1",
      });

      expect(mockedPrisma.agentLead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            agentId,
            status: "REJECTED",
            propertyId: "prop-1",
            prospectName: { contains: "chidi", mode: "insensitive" },
          }),
        }),
      );
    });

    it("returns an empty array when the agent has no leads (empty state)", async () => {
      mockedPrisma.agentLead.findMany.mockResolvedValue([]);

      const result = await service.getLeads(agentId, { status: "ALL" });

      expect(result).toEqual([]);
    });

    it("returns an empty array when a filter combination matches nothing (no filter results state)", async () => {
      mockedPrisma.agentLead.findMany.mockResolvedValue([]);

      const result = await service.getLeads(agentId, { search: "nonexistent", status: "ALL" });

      expect(result).toEqual([]);
    });
  });

  describe("deleteLead", () => {
    it("deletes a PENDING (draft) lead owned by the agent and logs activity", async () => {
      mockedPrisma.agentLead.findUnique.mockResolvedValue({
        id: "lead-1",
        agentId,
        status: "PENDING",
        prospectName: "Chidi Okafor",
        propertyId: "prop-1",
      });

      const result = await service.deleteLead(agentId, "lead-1");

      expect(mockedPrisma.agentLead.delete).toHaveBeenCalledWith({ where: { id: "lead-1" } });
      expect(mockedLogActivity).toHaveBeenCalledWith(
        expect.objectContaining({ userId: agentId, action: "AGENT_LEAD_DELETED" }),
      );
      expect(result).toEqual({ leadId: "lead-1" });
    });

    it("throws NotFoundError when the lead does not exist", async () => {
      mockedPrisma.agentLead.findUnique.mockResolvedValue(null);

      await expect(service.deleteLead(agentId, "lead-1")).rejects.toMatchObject({ statusCode: 404 });
      expect(mockedPrisma.agentLead.delete).not.toHaveBeenCalled();
    });

    it("throws ForbiddenError (403) when the lead belongs to another agent", async () => {
      mockedPrisma.agentLead.findUnique.mockResolvedValue({
        id: "lead-1",
        agentId: "someone-else",
        status: "PENDING",
        prospectName: "Chidi Okafor",
        propertyId: "prop-1",
      });

      await expect(service.deleteLead(agentId, "lead-1")).rejects.toMatchObject({ statusCode: 403 });
      expect(mockedPrisma.agentLead.delete).not.toHaveBeenCalled();
    });

    it("throws BadRequestError (400) when the lead is not in DRAFT/PENDING status", async () => {
      mockedPrisma.agentLead.findUnique.mockResolvedValue({
        id: "lead-1",
        agentId,
        status: "FORWARDED_TO_LANDLORD",
        prospectName: "Chidi Okafor",
        propertyId: "prop-1",
      });

      await expect(service.deleteLead(agentId, "lead-1")).rejects.toMatchObject({ statusCode: 400 });
      expect(mockedPrisma.agentLead.delete).not.toHaveBeenCalled();
    });
  });
});

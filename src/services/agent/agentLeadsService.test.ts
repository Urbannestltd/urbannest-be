import { AgentLeadsService } from "./agentLeadsService";

jest.mock("../../config/prisma", () => ({
  prisma: {
    agentLead: { findMany: jest.fn(), findUnique: jest.fn(), delete: jest.fn(), update: jest.fn(), create: jest.fn() },
    agentFee: { findUnique: jest.fn() },
    agentLeadDocument: { create: jest.fn(), delete: jest.fn() },
    property: { findFirst: jest.fn() },
    unit: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock("../external/zeptoMailService", () => ({
  ZeptoMailService: jest.fn().mockImplementation(() => ({
    sendEmail: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock("../../utils/activityLogger", () => ({
  logActivity: jest.fn(),
}));

jest.mock("axios");

import { prisma } from "../../config/prisma";
import { logActivity } from "../../utils/activityLogger";
import axios from "axios";

const mockedPrisma = prisma as unknown as {
  agentLead: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    delete: jest.Mock;
    update: jest.Mock;
    create: jest.Mock;
  };
  agentFee: { findUnique: jest.Mock };
  agentLeadDocument: { create: jest.Mock; delete: jest.Mock };
  property: { findFirst: jest.Mock };
  unit: { findFirst: jest.Mock };
  user: { findUnique: jest.Mock };
  $transaction: jest.Mock;
};
const mockedLogActivity = logActivity as jest.Mock;
const mockedAxios = axios as jest.Mocked<typeof axios>;

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
    // Default $transaction implementation: invoke the callback with the same mocked client
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(mockedPrisma));
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
      mockedPrisma.agentFee.findUnique.mockResolvedValue(null);

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

    it("allows deleting a FORWARDED_TO_LANDLORD lead (not yet decided)", async () => {
      mockedPrisma.agentLead.findUnique.mockResolvedValue({
        id: "lead-1",
        agentId,
        status: "FORWARDED_TO_LANDLORD",
        prospectName: "Chidi Okafor",
        propertyId: "prop-1",
      });
      mockedPrisma.agentFee.findUnique.mockResolvedValue(null);

      const result = await service.deleteLead(agentId, "lead-1");

      expect(mockedPrisma.agentLead.delete).toHaveBeenCalledWith({ where: { id: "lead-1" } });
      expect(result).toEqual({ leadId: "lead-1" });
    });

    it("throws ConflictError (409) when the lead has already been approved", async () => {
      mockedPrisma.agentLead.findUnique.mockResolvedValue({
        id: "lead-1",
        agentId,
        status: "APPROVED",
        prospectName: "Chidi Okafor",
        propertyId: "prop-1",
      });

      await expect(service.deleteLead(agentId, "lead-1")).rejects.toMatchObject({ statusCode: 409 });
      expect(mockedPrisma.agentLead.delete).not.toHaveBeenCalled();
    });

    it("throws ConflictError (409) when the lead was converted to a tenant", async () => {
      mockedPrisma.agentLead.findUnique.mockResolvedValue({
        id: "lead-1",
        agentId,
        status: "CONVERTED_TO_TENANT",
        prospectName: "Chidi Okafor",
        propertyId: "prop-1",
      });

      await expect(service.deleteLead(agentId, "lead-1")).rejects.toMatchObject({ statusCode: 409 });
      expect(mockedPrisma.agentLead.delete).not.toHaveBeenCalled();
    });

    it("throws ConflictError (409) when a REJECTED lead still has an AgentFee (rejected after approval)", async () => {
      mockedPrisma.agentLead.findUnique.mockResolvedValue({
        id: "lead-1",
        agentId,
        status: "REJECTED",
        prospectName: "Chidi Okafor",
        propertyId: "prop-1",
      });
      mockedPrisma.agentFee.findUnique.mockResolvedValue({ id: "fee-1", leadId: "lead-1" });

      await expect(service.deleteLead(agentId, "lead-1")).rejects.toMatchObject({ statusCode: 409 });
      expect(mockedPrisma.agentLead.delete).not.toHaveBeenCalled();
    });
  });

  const rawDoc = (overrides: Partial<any> = {}) => ({
    id: "doc-1",
    leadId: "lead-1",
    category: "ID",
    type: "PASSPORT",
    url: "https://storage.example.com/doc1.pdf",
    fileName: "doc1.pdf",
    fileSizeBytes: 1024,
    createdAt: new Date(2026, 5, 2),
    ...overrides,
  });

  const rawOwnedLead = (overrides: Partial<any> = {}) => ({
    id: "lead-1",
    agentId,
    propertyId: "prop-1",
    unitId: "unit-1",
    prospectName: "Chidi Okafor",
    prospectEmail: "chidi@example.com",
    prospectPhone: "08012345678",
    proposedRent: 500000,
    notes: null,
    occupation: null,
    monthlyIncome: null,
    employerName: null,
    employerAddress: null,
    employmentDuration: null,
    annualIncome: null,
    documents: [rawDoc()],
    status: "PENDING",
    rejectionReason: null,
    decidedAt: null,
    createdAt: new Date(2026, 5, 1),
    property: {
      name: "Zephyr Towers",
      landlordId: "landlord-1",
      landlord: { userFullName: "Obi Landlord", userEmail: "obi@landlord.com" },
    },
    unit: { name: "Unit 4B" },
    ...overrides,
  });

  describe("getLeadDetail", () => {
    it("returns full detail including structured documents and rejectionReason", async () => {
      mockedPrisma.agentLead.findUnique.mockResolvedValue(
        rawOwnedLead({ status: "REJECTED", rejectionReason: "Insufficient income" }),
      );

      const result = await service.getLeadDetail(agentId, "lead-1");

      expect(result.documents).toEqual([
        {
          id: "doc-1",
          category: "ID",
          type: "PASSPORT",
          url: "https://storage.example.com/doc1.pdf",
          fileName: "doc1.pdf",
          fileSizeBytes: 1024,
          createdAt: rawDoc().createdAt,
        },
      ]);
      expect(result.rejectionReason).toBe("Insufficient income");
    });

    it("throws ForbiddenError (403) when the lead belongs to another agent", async () => {
      mockedPrisma.agentLead.findUnique.mockResolvedValue(rawOwnedLead({ agentId: "someone-else" }));

      await expect(service.getLeadDetail(agentId, "lead-1")).rejects.toMatchObject({ statusCode: 403 });
    });

    it("throws NotFoundError (404) when the lead does not exist", async () => {
      mockedPrisma.agentLead.findUnique.mockResolvedValue(null);

      await expect(service.getLeadDetail(agentId, "lead-1")).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe("forwardLead", () => {
    it("forwards a draft lead with at least one document and notifies the landlord", async () => {
      mockedPrisma.agentLead.findUnique.mockResolvedValue(rawOwnedLead());
      mockedPrisma.user.findUnique.mockResolvedValue({ userFullName: "Amaka Agent" });

      const result = await service.forwardLead(agentId, "lead-1");

      expect(mockedPrisma.agentLead.update).toHaveBeenCalledWith({
        where: { id: "lead-1" },
        data: { status: "FORWARDED_TO_LANDLORD" },
      });
      expect(result).toEqual({ leadId: "lead-1", status: "FORWARDED_TO_LANDLORD" });
      expect(mockedLogActivity).toHaveBeenCalledWith(
        expect.objectContaining({ action: "AGENT_LEAD_FORWARDED" }),
      );
    });

    it("throws BadRequestError (400) when there are zero documents (button-disabled rule)", async () => {
      mockedPrisma.agentLead.findUnique.mockResolvedValue(rawOwnedLead({ documents: [] }));

      await expect(service.forwardLead(agentId, "lead-1")).rejects.toMatchObject({ statusCode: 400 });
      expect(mockedPrisma.agentLead.update).not.toHaveBeenCalled();
    });

    it("throws ConflictError (409) when the lead is not in Draft (PENDING) status", async () => {
      mockedPrisma.agentLead.findUnique.mockResolvedValue(
        rawOwnedLead({ status: "FORWARDED_TO_LANDLORD" }),
      );

      await expect(service.forwardLead(agentId, "lead-1")).rejects.toMatchObject({ statusCode: 409 });
      expect(mockedPrisma.agentLead.update).not.toHaveBeenCalled();
    });

    it("throws ForbiddenError (403) when the lead belongs to another agent", async () => {
      mockedPrisma.agentLead.findUnique.mockResolvedValue(rawOwnedLead({ agentId: "someone-else" }));

      await expect(service.forwardLead(agentId, "lead-1")).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe("resubmitLead", () => {
    it("reverts a pre-approval rejected lead back to Draft (PENDING) and clears the rejection reason", async () => {
      mockedPrisma.agentLead.findUnique.mockResolvedValue(
        rawOwnedLead({ status: "REJECTED", rejectionReason: "Missing payslip" }),
      );
      mockedPrisma.agentFee.findUnique.mockResolvedValue(null);

      const result = await service.resubmitLead(agentId, "lead-1");

      expect(mockedPrisma.agentLead.update).toHaveBeenCalledWith({
        where: { id: "lead-1" },
        data: { status: "PENDING", rejectionReason: null, decidedAt: null },
      });
      expect(result).toEqual({ leadId: "lead-1", status: "PENDING" });
    });

    it("throws ConflictError (409) when the lead is not REJECTED", async () => {
      mockedPrisma.agentLead.findUnique.mockResolvedValue(rawOwnedLead({ status: "PENDING" }));

      await expect(service.resubmitLead(agentId, "lead-1")).rejects.toMatchObject({ statusCode: 409 });
      expect(mockedPrisma.agentLead.update).not.toHaveBeenCalled();
    });

    it("throws ConflictError (409) when rejected via the post-approval Safety Switch (a fee was already created)", async () => {
      mockedPrisma.agentLead.findUnique.mockResolvedValue(rawOwnedLead({ status: "REJECTED" }));
      mockedPrisma.agentFee.findUnique.mockResolvedValue({ id: "fee-1", leadId: "lead-1", status: "REJECTED" });

      await expect(service.resubmitLead(agentId, "lead-1")).rejects.toMatchObject({ statusCode: 409 });
      expect(mockedPrisma.agentLead.update).not.toHaveBeenCalled();
    });

    it("throws ForbiddenError (403) when the lead belongs to another agent", async () => {
      mockedPrisma.agentLead.findUnique.mockResolvedValue(
        rawOwnedLead({ agentId: "someone-else", status: "REJECTED" }),
      );

      await expect(service.resubmitLead(agentId, "lead-1")).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe("submitLead", () => {
    const validRequest = {
      propertyId: "prop-1",
      unitId: "unit-1",
      prospectName: "Chidi Okafor",
      prospectEmail: "chidi@example.com",
      prospectPhone: "08012345678",
      proposedRent: 3200000,
      notes: "Wants to move in by next month",
    };

    it("creates a Draft (PENDING) lead when the property is agent-owned and unit is vacant", async () => {
      mockedPrisma.property.findFirst.mockResolvedValue({ id: "prop-1", agentId, isDeleted: false });
      mockedPrisma.unit.findFirst.mockResolvedValue({ id: "unit-1", propertyId: "prop-1", status: "AVAILABLE" });
      mockedPrisma.agentLead.create.mockResolvedValue({
        id: "lead-new",
        agentId,
        ...validRequest,
        status: "PENDING",
        createdAt: new Date(2026, 6, 1),
      });

      const result = await service.submitLead(agentId, validRequest);

      expect(mockedPrisma.agentLead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "PENDING", agentId, propertyId: "prop-1", unitId: "unit-1" }),
        }),
      );
      expect(result.status).toBe("PENDING");
      expect(mockedLogActivity).toHaveBeenCalledWith(
        expect.objectContaining({ action: "AGENT_LEAD_ADDED" }),
      );
    });

    it("throws NotFoundError (404) when the property does not exist", async () => {
      mockedPrisma.property.findFirst.mockResolvedValue(null);

      await expect(service.submitLead(agentId, validRequest)).rejects.toMatchObject({ statusCode: 404 });
      expect(mockedPrisma.agentLead.create).not.toHaveBeenCalled();
    });

    it("throws ForbiddenError (403) when the property is not assigned to this agent", async () => {
      mockedPrisma.property.findFirst.mockResolvedValue({ id: "prop-1", agentId: "someone-else", isDeleted: false });

      await expect(service.submitLead(agentId, validRequest)).rejects.toMatchObject({ statusCode: 403 });
      expect(mockedPrisma.agentLead.create).not.toHaveBeenCalled();
    });

    it("throws BadRequestError (400) when the unit does not belong to the property", async () => {
      mockedPrisma.property.findFirst.mockResolvedValue({ id: "prop-1", agentId, isDeleted: false });
      mockedPrisma.unit.findFirst.mockResolvedValue(null);

      await expect(service.submitLead(agentId, validRequest)).rejects.toMatchObject({ statusCode: 400 });
      expect(mockedPrisma.agentLead.create).not.toHaveBeenCalled();
    });

    it("throws ConflictError (409) with the exact message when the unit is no longer vacant", async () => {
      mockedPrisma.property.findFirst.mockResolvedValue({ id: "prop-1", agentId, isDeleted: false });
      mockedPrisma.unit.findFirst.mockResolvedValue({ id: "unit-1", propertyId: "prop-1", status: "OCCUPIED" });

      await expect(service.submitLead(agentId, validRequest)).rejects.toMatchObject({
        statusCode: 409,
        message: "This unit is no longer available. Please select a different unit.",
      });
      expect(mockedPrisma.agentLead.create).not.toHaveBeenCalled();
    });

    it("re-checks vacancy inside the transaction (freshly, not from a stale earlier read)", async () => {
      mockedPrisma.property.findFirst.mockResolvedValue({ id: "prop-1", agentId, isDeleted: false });
      mockedPrisma.unit.findFirst.mockResolvedValue({ id: "unit-1", propertyId: "prop-1", status: "AVAILABLE" });
      mockedPrisma.agentLead.create.mockResolvedValue({
        id: "lead-new",
        ...validRequest,
        agentId,
        status: "PENDING",
        createdAt: new Date(),
      });

      await service.submitLead(agentId, validRequest);

      expect(mockedPrisma.$transaction).toHaveBeenCalled();
      expect(mockedPrisma.unit.findFirst).toHaveBeenCalledWith({
        where: { id: "unit-1", propertyId: "prop-1" },
      });
    });
  });

  describe("updateLead", () => {
    it("partially updates a Draft lead", async () => {
      mockedPrisma.agentLead.findUnique.mockResolvedValue(rawOwnedLead());

      await service.updateLead(agentId, "lead-1", { notes: "Updated note" });

      expect(mockedPrisma.agentLead.update).toHaveBeenCalledWith({
        where: { id: "lead-1" },
        data: { notes: "Updated note" },
      });
    });

    it("throws ConflictError (409) when the lead is not Draft (read-only)", async () => {
      mockedPrisma.agentLead.findUnique.mockResolvedValue(rawOwnedLead({ status: "FORWARDED_TO_LANDLORD" }));

      await expect(
        service.updateLead(agentId, "lead-1", { notes: "x" }),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(mockedPrisma.agentLead.update).not.toHaveBeenCalled();
    });

    it("throws ForbiddenError (403) when the lead belongs to another agent", async () => {
      mockedPrisma.agentLead.findUnique.mockResolvedValue(rawOwnedLead({ agentId: "someone-else" }));

      await expect(
        service.updateLead(agentId, "lead-1", { notes: "x" }),
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe("uploadDocument", () => {
    const uploadRequest = {
      url: "https://storage.example.com/props/passport.pdf",
      fileName: "passport.pdf",
      category: "ID" as const,
      type: "PASSPORT" as const,
    };

    it("uploads a valid document to a Draft lead, reading file size via HEAD request", async () => {
      mockedPrisma.agentLead.findUnique.mockResolvedValue(rawOwnedLead());
      mockedAxios.head.mockResolvedValue({ headers: { "content-length": "2048" } } as any);
      mockedPrisma.agentLeadDocument.create.mockResolvedValue(rawDoc({ fileSizeBytes: 2048 }));

      const result = await service.uploadDocument(agentId, "lead-1", uploadRequest);

      expect(mockedPrisma.agentLeadDocument.create).toHaveBeenCalledWith({
        data: {
          leadId: "lead-1",
          category: "ID",
          type: "PASSPORT",
          url: uploadRequest.url,
          fileName: "passport.pdf",
          fileSizeBytes: 2048,
        },
      });
      expect(result.fileSizeBytes).toBe(2048);
    });

    it("throws BadRequestError (400) for an unsupported file format", async () => {
      mockedPrisma.agentLead.findUnique.mockResolvedValue(rawOwnedLead());

      await expect(
        service.uploadDocument(agentId, "lead-1", { ...uploadRequest, fileName: "passport.exe" }),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(mockedPrisma.agentLeadDocument.create).not.toHaveBeenCalled();
    });

    it("throws BadRequestError (400) when the file exceeds the maximum size", async () => {
      mockedPrisma.agentLead.findUnique.mockResolvedValue(rawOwnedLead());
      mockedAxios.head.mockResolvedValue({ headers: { "content-length": String(11 * 1024 * 1024) } } as any);

      await expect(
        service.uploadDocument(agentId, "lead-1", uploadRequest),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(mockedPrisma.agentLeadDocument.create).not.toHaveBeenCalled();
    });

    it("throws BadRequestError (400) when the file cannot be verified (HEAD request fails)", async () => {
      mockedPrisma.agentLead.findUnique.mockResolvedValue(rawOwnedLead());
      mockedAxios.head.mockRejectedValue(new Error("network error"));

      await expect(
        service.uploadDocument(agentId, "lead-1", uploadRequest),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(mockedPrisma.agentLeadDocument.create).not.toHaveBeenCalled();
    });

    it("throws ConflictError (409) when the lead is not Draft", async () => {
      mockedPrisma.agentLead.findUnique.mockResolvedValue(rawOwnedLead({ status: "FORWARDED_TO_LANDLORD" }));

      await expect(
        service.uploadDocument(agentId, "lead-1", uploadRequest),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(mockedPrisma.agentLeadDocument.create).not.toHaveBeenCalled();
    });

    it("throws ForbiddenError (403) when the lead belongs to another agent", async () => {
      mockedPrisma.agentLead.findUnique.mockResolvedValue(rawOwnedLead({ agentId: "someone-else" }));

      await expect(
        service.uploadDocument(agentId, "lead-1", uploadRequest),
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe("deleteDocument", () => {
    it("deletes a document from a Draft lead", async () => {
      mockedPrisma.agentLead.findUnique.mockResolvedValue(rawOwnedLead());

      await service.deleteDocument(agentId, "lead-1", "doc-1");

      expect(mockedPrisma.agentLeadDocument.delete).toHaveBeenCalledWith({ where: { id: "doc-1" } });
    });

    it("throws NotFoundError (404) when the document does not belong to this lead", async () => {
      mockedPrisma.agentLead.findUnique.mockResolvedValue(rawOwnedLead());

      await expect(
        service.deleteDocument(agentId, "lead-1", "nonexistent-doc"),
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(mockedPrisma.agentLeadDocument.delete).not.toHaveBeenCalled();
    });

    it.each(["FORWARDED_TO_LANDLORD", "APPROVED", "REJECTED", "CONVERTED_TO_TENANT"])(
      "throws ConflictError (409) when the lead status is %s (read-only)",
      async (status) => {
        mockedPrisma.agentLead.findUnique.mockResolvedValue(rawOwnedLead({ status }));

        await expect(
          service.deleteDocument(agentId, "lead-1", "doc-1"),
        ).rejects.toMatchObject({ statusCode: 409 });
        expect(mockedPrisma.agentLeadDocument.delete).not.toHaveBeenCalled();
      },
    );

    it("throws ForbiddenError (403) when the lead belongs to another agent", async () => {
      mockedPrisma.agentLead.findUnique.mockResolvedValue(rawOwnedLead({ agentId: "someone-else" }));

      await expect(
        service.deleteDocument(agentId, "lead-1", "doc-1"),
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });
});

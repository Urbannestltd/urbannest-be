jest.mock("../config/prisma", () => ({
  prisma: {
    payment: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  },
}));

jest.mock("../utils/paystackClient", () => ({
  paystackClient: { get: jest.fn() },
}));

jest.mock("./external/vtPassService", () => ({
  VTPassService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("./external/zeptoMailService", () => ({
  ZeptoMailService: jest.fn().mockImplementation(() => ({
    sendEmail: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { PaymentService } from "./paymentService";
import { prisma } from "../config/prisma";
import { paystackClient } from "../utils/paystackClient";
import { NotFoundError } from "../utils/apiError";

const mockedPrisma = prisma as unknown as {
  payment: { findUnique: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
};
const mockedPaystack = paystackClient as unknown as { get: jest.Mock };

const REFERENCE = "ref-1";
const OWNER_ID = "user-a";
const ATTACKER_ID = "user-b";

describe("PaymentService.verifyPayment — cross-user access (BOLA)", () => {
  let service: PaymentService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PaymentService();
  });

  it("rejects with 404 when the caller does not own the payment reference, without contacting Paystack or mutating anything", async () => {
    mockedPrisma.payment.findUnique.mockResolvedValue({
      id: "payment-1",
      userId: OWNER_ID,
      status: "PENDING",
      metadata: {},
    });

    await expect(service.verifyPayment(REFERENCE, ATTACKER_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(mockedPaystack.get).not.toHaveBeenCalled();
    expect(mockedPrisma.payment.update).not.toHaveBeenCalled();
    expect(mockedPrisma.payment.updateMany).not.toHaveBeenCalled();
  });

  it("rejects with 404 for a non-existent reference regardless of caller", async () => {
    mockedPrisma.payment.findUnique.mockResolvedValue(null);

    await expect(service.verifyPayment(REFERENCE, OWNER_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(mockedPaystack.get).not.toHaveBeenCalled();
  });

  it("allows the webhook path (no expectedUserId) to proceed regardless of who owns the payment", async () => {
    mockedPrisma.payment.findUnique.mockResolvedValue({
      id: "payment-1",
      userId: OWNER_ID,
      status: "PAID",
      utilityToken: "TOKEN123",
      metadata: {},
    });

    const result = await service.verifyPayment(REFERENCE);

    expect(result).toEqual({
      success: true,
      message: "Transaction already processed.",
      token: "TOKEN123",
    });
  });

  it("allows the actual owner to verify their own payment", async () => {
    mockedPrisma.payment.findUnique.mockResolvedValue({
      id: "payment-1",
      userId: OWNER_ID,
      status: "PAID",
      utilityToken: "TOKEN123",
      metadata: {},
    });

    const result = await service.verifyPayment(REFERENCE, OWNER_ID);

    expect(result).toEqual({
      success: true,
      message: "Transaction already processed.",
      token: "TOKEN123",
    });
    expect(mockedPaystack.get).not.toHaveBeenCalled();
  });
});

import { z } from "zod";

export const DOCUMENT_CATEGORIES = ["ID", "PROOF_OF_INCOME", "PROOF_OF_ADDRESS"] as const;

export const DOCUMENT_TYPES_BY_CATEGORY: Record<string, readonly string[]> = {
  ID: ["PASSPORT", "NATIONAL_ID", "DRIVERS_LICENSE", "VOTERS_CARD"],
  PROOF_OF_INCOME: ["BANK_STATEMENT", "EMPLOYMENT_LETTER", "PAYSLIP", "PROOF_OF_BUSINESS"],
  PROOF_OF_ADDRESS: ["UTILITY_BILL", "BANK_STATEMENT"],
};

export const ALL_DOCUMENT_TYPES = [
  "PASSPORT",
  "NATIONAL_ID",
  "DRIVERS_LICENSE",
  "VOTERS_CARD",
  "BANK_STATEMENT",
  "EMPLOYMENT_LETTER",
  "PAYSLIP",
  "PROOF_OF_BUSINESS",
  "UTILITY_BILL",
] as const;

export const UploadDocumentSchema = z
  .object({
    url: z.string().url("Invalid document URL"),
    fileName: z.string().min(1).max(255),
    category: z.enum(DOCUMENT_CATEGORIES),
    type: z.enum(ALL_DOCUMENT_TYPES),
  })
  .refine((data) => DOCUMENT_TYPES_BY_CATEGORY[data.category]?.includes(data.type), {
    message: "This document type does not belong to the selected category",
    path: ["type"],
  });
export type UploadDocumentRequest = z.infer<typeof UploadDocumentSchema>;

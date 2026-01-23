import { z } from "zod";

// 1. VERIFY METER (Request)
export const VerifyMeterSchema = z.object({
  serviceID: z.string(), // e.g. "ikeja-electric-prepaid"
  meterNumber: z.string().min(5),
  type: z.string().optional(), // "prepaid" or "postpaid"
});

// 2. PURCHASE UTILITY (Request)
export const PurchaseUtilitySchema = z.object({
  serviceID: z.string(),
  meterNumber: z.string(),
  amount: z.number().min(500),
  // Optional: Save this meter for later?
  saveMeter: z.boolean().optional(),
  label: z.string().optional(), // e.g. "My Flat"
});

export interface PurchaseUtilityRequest {
  serviceID: string;
  type: string;
  meterNumber: string;
  amount: number;
  saveMeter?: boolean;
  label?: string;
}

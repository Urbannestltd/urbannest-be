import { z } from "zod";

export const InitiateRentSchema = z.object({
  amount: z.number().min(1000, "Minimum payment is NGN 1,000"),

  // SCENARIO 1: New Move-In (Required if moving into a new place)
  unitId: z.uuid().optional(),

  // SCENARIO 2: Renewal (Set to true if extending an existing lease)
  isRenewal: z.boolean().optional(),

  // FLEXIBLE DURATION: How long is this payment for?
  // Defaults to 1 Year if not specified
  durationValue: z.number().min(1).default(1),
  durationUnit: z.enum(["MONTH", "YEAR"]).default("YEAR"),
});

export type InitiateRentRequest = z.infer<typeof InitiateRentSchema>;

export interface RentHistoryResponse {
  paymentId: string;
  amount: number;
  date: Date;
  status: string;
  reference: string;
  description: string;
}

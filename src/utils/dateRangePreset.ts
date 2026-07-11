import { z } from "zod";

export const DateRangePresetSchema = z.enum([
  "TODAY",
  "LAST_7_DAYS",
  "LAST_30_DAYS",
  "THIS_MONTH",
  "THIS_YEAR",
]);
export type DateRangePreset = z.infer<typeof DateRangePresetSchema>;

/** Resolves a preset to a trailing window ending now, anchored to calendar boundaries where applicable. */
export function resolveDateRangePreset(
  preset: DateRangePreset,
  now: Date = new Date(),
): { start: Date; end: Date } {
  const end = new Date(now);
  const start = new Date(now);

  switch (preset) {
    case "TODAY":
      start.setHours(0, 0, 0, 0);
      break;
    case "LAST_7_DAYS":
      start.setDate(start.getDate() - 7);
      break;
    case "LAST_30_DAYS":
      start.setDate(start.getDate() - 30);
      break;
    case "THIS_MONTH":
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case "THIS_YEAR":
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      break;
  }

  return { start, end };
}

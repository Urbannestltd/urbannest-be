import { z } from "zod";
import { BadRequestError } from "./apiError";

export function validate<T>(schema: z.ZodSchema<T>, data: any): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    // Format the Zod errors into a readable string or object
    const errorMessages = result.error.issues
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join(", ");
    throw new BadRequestError(`Validation Failed: ${errorMessages}`);
  }

  return result.data;
}

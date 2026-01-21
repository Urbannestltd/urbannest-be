import { ApiResponse } from "../dtos/apiResponse";

/**
 * A standard helper to wrap successful results.
 * * @param data - The payload you want to return (e.g. User object, Lease list)
 * @param message - Optional success message (defaults to "Success")
 */
export function successResponse<T>(
  data: T,
  message: string = "Success"
): ApiResponse<T> {
  return {
    success: true,
    message,
    data,
  };
}

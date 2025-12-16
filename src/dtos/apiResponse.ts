export interface ApiResponse<T> {
  /**
   * Indicates if the request was successful
   * @example true
   */
  success: boolean;

  /**
   * A human-readable message
   * @example "Operation successful"
   */
  message: string;
  data?: T;
}

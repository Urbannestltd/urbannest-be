export class ApiError extends Error {
  statusCode: number;
  details?: any; // Optional: extra details (e.g., validation errors)

  constructor(message: string, statusCode: number, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;

    // Essential: Restore prototype chain for 'instanceof' checks to work in TypeScript
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

// ========================================================================
// Specific Error Types (Syntactic Sugar)
// ========================================================================

/**
 * 400 Bad Request
 * Use when the client sends invalid data (e.g. invalid email format)
 */
export class BadRequestError extends ApiError {
  constructor(message: string = "Bad Request", details?: any) {
    super(message, 400, details);
    Object.setPrototypeOf(this, BadRequestError.prototype);
  }
}

/**
 * 401 Unauthorized
 * Use when the user is not logged in or token is invalid
 */
export class UnauthorizedError extends ApiError {
  constructor(message: string = "Unauthorized") {
    super(message, 401);
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

/**
 * 403 Forbidden
 * Use when the user is logged in but doesn't have permission (e.g. Admin only)
 */
export class ForbiddenError extends ApiError {
  constructor(message: string = "Forbidden") {
    super(message, 403);
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

/**
 * 404 Not Found
 * Use when a resource (User, Product, Post) cannot be found
 */
export class NotFoundError extends ApiError {
  constructor(message: string = "Resource not found") {
    super(message, 404);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * 409 Conflict
 * Use when creating a resource that already exists (e.g. Duplicate email)
 */
export class ConflictError extends ApiError {
  constructor(message: string = "Conflict") {
    super(message, 409);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

/**
 * 500 Internal Server Error
 * Use for unexpected server crashes (catch blocks)
 */
export class InternalServerError extends ApiError {
  constructor(message: string = "Internal Server Error") {
    super(message, 500);
    Object.setPrototypeOf(this, InternalServerError.prototype);
  }
}

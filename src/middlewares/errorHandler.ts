import { Request, Response, NextFunction } from "express";
import { ValidateError } from "tsoa";
import { ApiError } from "../utils/apiError";

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): Response | void => {
  if (err instanceof ValidateError) {
    console.warn(`Caught Validation Error for ${req.path}:`, err.fields);
    return res.status(422).json({
      message: "Validation Failed",
      details: err?.fields,
    });
  }

  if ((err as any).statusCode) {
    const status = (err as any).statusCode;
    return res.status(status).json({
      message: (err as any).message,
    });
  }

  if (err instanceof Error) {
    console.error("Unhandled Error:", err);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }

  next();
};

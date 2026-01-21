import dotenv from "dotenv";

dotenv.config();

export const PORT = process.env.PORT || 3000;
export const DATABASE_URL = process.env.DATABASE_URL || "";
export const NODE_ENV = process.env.NODE_ENV || "development";
export const JWTSECRET = process.env.JWTSECRET || "your_jwt_secret";
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
export const DIRECT_URL = process.env.DIRECT_URL || "";
export const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
export const MAIL_USER = process.env.MAIL_USER || "";
export const MAIL_PASS = process.env.MAIL_PASS || "";
export const BASE_URL = process.env.URL || "http://localhost:3000";
export const VTPASS_PUBLIC_KEY = process.env.VTPASS_PUBLIC_KEY || "";
export const VTPASS_SECRET_KEY = process.env.VTPASS_SECRET_KEY || "";
export const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
export const VTPASS_BASE_URL =
  process.env.VTPASS_BASE_URL || "https://sandbox.vtpass.com/api";

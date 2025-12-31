import dotenv from "dotenv";

dotenv.config();

export const PORT = process.env.PORT || 3000;
export const DATABASE_URL = process.env.DATABASE_URL || "";
export const NODE_ENV = process.env.NODE_ENV || "development";
export const JWTSECRET = process.env.JWTSECRET || "your_jwt_secret";
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
export const DIRECT_URL = process.env.DIRECT_URL || "";
export const RESEND_API_KEY = process.env.RESEND_API_KEY || "";

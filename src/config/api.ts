import { NotFoundError } from "../utils/apiError";

const getEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new NotFoundError(`MISSING CONFIG: ${key} is not defined in .env`);
  }
  return value;
};

export const apiConfig = {
  paystack: {
    secretKey: getEnv("PAYSTACK_SECRET_KEY"),
    currency: "ngn",
    baseUrl: getEnv("PAYSTACK_BASE_URL"),
  },
  vtpass: {
    publicKey: getEnv("VTPASS_PUBLIC_KEY"),
    secretKey: getEnv("VTPASS_SECRET_KEY"),
  },
};

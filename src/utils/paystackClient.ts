import axios from "axios";
import { apiConfig } from "../config/api";

export const paystackClient = axios.create({
  baseURL: apiConfig.paystack.baseUrl,
  headers: {
    Authorization: `Bearer ${apiConfig.paystack.secretKey}`,
    "Content-Type": "application/json",
  },
  timeout: 10000,
});

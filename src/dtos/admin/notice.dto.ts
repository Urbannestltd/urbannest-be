import { z } from "zod";

export const SendNoticeSchema = z.object({
  title: z.string().min(1, "Title is required").max(150),
  message: z.string().min(1, "Message is required").max(5000),
});

export type SendNoticeDto = z.infer<typeof SendNoticeSchema>;

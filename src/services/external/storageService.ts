import { createClient } from "@supabase/supabase-js";
import { BadRequestError } from "../../utils/apiError";

export class StorageService {
  private supabase;
  private bucketName = "Urbannest"; // Make sure this bucket exists in Supabase

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!, // Use Service Role for admin privileges
    );
  }

  /**
   * 1. GENERATE SIGNED UPLOAD URL
   * Frontend calls this -> Gets URL -> Uploads file directly.
   * Path: `maintenance/{userId}/{timestamp}_filename.jpg`
   */
  public async createUploadUrl(path: string) {
    const { data, error } = await this.supabase.storage
      .from(this.bucketName)
      .createSignedUploadUrl(path);
    console.log(error);
    if (error) throw new BadRequestError(`Storage Error: ${error.message}`);

    return {
      uploadUrl: data.signedUrl, // Use this with PUT request
      publicPath: data.path, // Send this back to API to save in DB
      fullUrl: this.getPublicUrl(data.path), // For viewing later
    };
  }

  /**
   * 2. GET PUBLIC VIEW URL
   */
  public getPublicUrl(path: string) {
    const { data } = this.supabase.storage
      .from(this.bucketName)
      .getPublicUrl(path);

    return data.publicUrl;
  }
}

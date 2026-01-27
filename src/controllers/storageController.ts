import { Controller, Post, Body, Route, Tags, Security, Request } from "tsoa";
import { StorageService } from "../services/external/storageService";
import { successResponse } from "../utils/responseHelper";

@Route("storage")
@Tags("File Uploads")
export class StorageController extends Controller {
  private storage = new StorageService();

  /**
   * Get a Secure Upload Link.
   * Frontend sends: { "filename": "leak.jpg", "folder": "maintenance" }
   */
  @Post("sign-url")
  @Security("jwt")
  public async getUploadUrl(
    @Request() req: any,
    @Body() body: { filename: string; folder: "maintenance" | "support" },
  ) {
    const userId = req.user.userId;
    // Create a clean path: maintenance/user-123/176930000_leak.jpg
    const path = `${body.folder}/${userId}/${Date.now()}_${body.filename}`;

    const result = await this.storage.createUploadUrl(path);
    return successResponse(result, "Upload URL generated");
  }
}

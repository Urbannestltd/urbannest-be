import { Controller, Get, Patch, Post, Path, Query, Route, Tags, Security, Request } from "tsoa";
import { notificationService } from "../services/notificationService";
import { successResponse } from "../utils/responseHelper";

/**
 * Notification inbox — shared across every role. Notification.recipientId is
 * a bare userId with identical list/read semantics regardless of role, so
 * this is one controller rather than a per-role wrapper in each role folder.
 */
@Route("notifications")
@Tags("Notifications")
@Security("jwt")
export class NotificationController extends Controller {
  @Get()
  public async list(@Request() req: any, @Query() unreadOnly?: boolean) {
    const data = await notificationService.list(req.user.userId, { unreadOnly });
    return successResponse(data, "Notifications retrieved");
  }

  @Get("unread-count")
  public async unreadCount(@Request() req: any) {
    const count = await notificationService.unreadCount(req.user.userId);
    return successResponse({ count }, "Unread count retrieved");
  }

  @Patch("{id}/read")
  public async markRead(@Path() id: string, @Request() req: any) {
    await notificationService.markRead(req.user.userId, id);
    return successResponse(null, "Notification marked as read");
  }

  @Post("mark-all-read")
  public async markAllRead(@Request() req: any) {
    await notificationService.markAllRead(req.user.userId);
    return successResponse(null, "All notifications marked as read");
  }
}

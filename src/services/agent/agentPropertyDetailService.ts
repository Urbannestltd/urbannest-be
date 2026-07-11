import { prisma } from "../../config/prisma";
import { ForbiddenError } from "../../utils/apiError";
import { logActivity } from "../../utils/activityLogger";
import { normalizeFloor, normalizePropertyType } from "../admin/propertyService";
import type {
  AgentPropertyDetail,
  PropertyMediaItem,
  MediaDownloadResponse,
  VacantUnitItem,
} from "../../dtos/agent/agent.property-detail.dto";

export class AgentPropertyDetailService {

  private async assertAgentOwnsProperty(agentId: string, propertyId: string) {
    const property = await prisma.property.findFirst({
      where: { id: propertyId, isDeleted: false },
      include: {
        units: {
          where: { status: { not: "DELETED" } },
          select: { floor: true },
        },
      },
    });
    if (!property || property.agentId !== agentId) {
      throw new ForbiddenError("You are not assigned to market this property");
    }
    return property;
  }

  private fileNameFromUrl(url: string): string {
    try {
      const pathname = new URL(url).pathname;
      const lastSegment = decodeURIComponent(pathname.split("/").pop() || "");
      return /\.[a-zA-Z0-9]{2,5}$/.test(lastSegment) ? lastSegment : url;
    } catch {
      return url;
    }
  }

  public async getPropertyDetail(
    agentId: string,
    propertyId: string,
  ): Promise<AgentPropertyDetail> {
    const property = await this.assertAgentOwnsProperty(agentId, propertyId);

    const noOfUnits = property.units.length;
    const distinctFloors = new Set(property.units.map((u) => normalizeFloor(u.floor)));
    const noOfFloors = distinctFloors.size;

    const media: PropertyMediaItem[] = property.images.map((url) => ({
      url,
      fileName: this.fileNameFromUrl(url),
    }));

    return {
      propertyId: property.id,
      propertyName: property.name,
      propertyType: normalizePropertyType(property.type),
      address: property.address,
      rent: property.price,
      noOfUnits,
      noOfFloors,
      lastUpdated: property.updatedAt,
      media,
      amenities: property.amenities,
    };
  }

  public async getMediaDownloadUrl(
    agentId: string,
    propertyId: string,
    url: string,
  ): Promise<MediaDownloadResponse> {
    const property = await this.assertAgentOwnsProperty(agentId, propertyId);

    if (!property.images.includes(url)) {
      throw new ForbiddenError("This media asset does not belong to this property");
    }

    await logActivity({
      userId: agentId,
      action: "AGENT_PROPERTY_MEDIA_DOWNLOADED",
      description: `Downloaded media for property ${propertyId}`,
      metadata: { propertyId, url },
    });

    return { url };
  }

  public async getVacantUnits(agentId: string, propertyId: string): Promise<VacantUnitItem[]> {
    await this.assertAgentOwnsProperty(agentId, propertyId);

    const units = await prisma.unit.findMany({
      where: { propertyId, status: "AVAILABLE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return units.map((u) => ({ unitId: u.id, unitName: u.name }));
  }
}

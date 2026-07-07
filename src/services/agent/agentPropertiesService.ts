import { prisma } from "../../config/prisma";
import type {
  AgentPropertiesQuery,
  AgentPropertyListItem,
} from "../../dtos/agent/agent.properties.dto";

export class AgentPropertiesService {

  public async getAssignedProperties(
    agentId: string,
    query: AgentPropertiesQuery,
  ): Promise<AgentPropertyListItem[]> {
    const properties = await prisma.property.findMany({
      where: {
        agentId,
        isDeleted: false,
        ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
      },
      select: {
        id: true,
        name: true,
        type: true,
        address: true,
        createdAt: true,
        units: {
          where: { status: { not: "DELETED" } },
          select: { status: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const items: AgentPropertyListItem[] = properties.map((p) => {
      const totalUnitCount = p.units.length;
      const availableUnitCount = p.units.filter((u) => u.status === "AVAILABLE").length;
      return {
        propertyId: p.id,
        propertyName: p.name,
        propertyType: p.type,
        address: p.address,
        dateAssigned: p.createdAt,
        availabilityStatus: availableUnitCount > 0 ? "AVAILABLE" : "FULLY_OCCUPIED",
        totalUnitCount,
        availableUnitCount,
      };
    });

    if (query.availability === "AVAILABLE") {
      return items.filter((i) => i.availableUnitCount > 0);
    }
    if (query.availability === "FULLY_OCCUPIED") {
      return items.filter((i) => i.availableUnitCount === 0);
    }
    return items;
  }
}

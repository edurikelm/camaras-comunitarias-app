import { AuditAction, IncidentType, AlertSeverity, IncidentStatus } from "@/generated/prisma/enums";
import {
  CommunityInvariantError,
  CommunityNotFoundError,
} from "@/domain/community/errors";
import type { IncidentRepository } from "./incident-repository";
import { ensureCanCreateIncident } from "@/domain/community/policies";

// ---------------------------------------------------------------------------
// Severity suggestion
// ---------------------------------------------------------------------------

const SEVERITY_BY_TYPE: Record<IncidentType, AlertSeverity> = {
  [IncidentType.EMERGENCY]: AlertSeverity.CRITICAL,
  [IncidentType.THEFT]: AlertSeverity.HIGH,
  [IncidentType.ACCIDENT]: AlertSeverity.HIGH,
  [IncidentType.SUSPICIOUS_PERSON]: AlertSeverity.MEDIUM,
  [IncidentType.SUSPICIOUS_VEHICLE]: AlertSeverity.MEDIUM,
  [IncidentType.OTHER]: AlertSeverity.LOW,
};

function suggestSeverity(type: IncidentType): AlertSeverity {
  return SEVERITY_BY_TYPE[type];
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export type CreateIncidentInput = {
  actor: { id: string };
  communityId: string;
  incident: {
    type: IncidentType;
    description: string;
    location?: string;
    sectorId?: string;
  };
};

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type CreateIncidentResult = {
  incident: {
    id: string;
    communityId: string;
    type: IncidentType;
    severity: AlertSeverity;
    status: IncidentStatus;
    description: string;
    location: string | null;
    sectorId: string | null;
    createdAt: Date;
  };
  alert: {
    id: string;
    severity: AlertSeverity;
    message: string;
  };
};

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export type CreateIncidentDeps = {
  incidentRepository: IncidentRepository;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function createIncident(
  input: CreateIncidentInput,
  { incidentRepository }: CreateIncidentDeps,
): Promise<CreateIncidentResult> {
  const communityId = input.communityId.trim();
  if (!communityId) {
    throw new CommunityInvariantError("communityId is required");
  }

  const { incident } = input;

  // Validate type
  const validTypes: string[] = Object.values(IncidentType);
  if (!incident.type || !validTypes.includes(incident.type)) {
    throw new CommunityInvariantError(`Invalid incident type: ${incident.type}`);
  }

  // Validate description
  const description = incident.description.trim();
  if (!description) {
    throw new CommunityInvariantError("Incident description is required");
  }

  return incidentRepository.runInTransaction(async (tx) => {
    // 1. Validate actor can create incident (community ACTIVE + member is NEIGHBOR or GUARD)
    await ensureCanCreateIncident({
      client: tx,
      actor: input.actor,
      communityId,
    });

    // 2. If sectorId provided, verify it belongs to the community
    const sectorId = incident.sectorId ?? null;
    if (sectorId) {
      const sector = await tx.findSectorById(sectorId);
      if (!sector) {
        throw new CommunityNotFoundError("Sector not found");
      }
      if (sector.communityId !== communityId) {
        throw new CommunityInvariantError("Sector does not belong to this community");
      }
    }

    // 3. Suggest severity by type
    const severity = suggestSeverity(incident.type);

    // 4. Build alert message
    const location = incident.location?.trim() ?? null;
    const locationPart = location ? ` en ${location}` : "";
    const alertMessage = `${incident.type} reportado${locationPart}: ${description}`;

    // 5. Create incident
    const createdIncident = await tx.createIncident({
      communityId,
      createdById: input.actor.id,
      sectorId,
      type: incident.type,
      severity,
      description,
      location,
    });

    // 6. Create alert
    const alert = await tx.createAlert({
      communityId,
      incidentId: createdIncident.id,
      sectorId,
      severity,
      type: incident.type,
      message: alertMessage,
    });

    // 7. Audit
    await tx.createAuditLog({
      communityId,
      actorId: input.actor.id,
      action: AuditAction.INCIDENT_CREATED,
      entityType: "Incident",
      entityId: createdIncident.id,
      metadata: {
        incidentType: incident.type,
        severity,
        location,
        description,
        communityId,
        alertId: alert.id,
      },
    });

    return {
      incident: {
        id: createdIncident.id,
        communityId: createdIncident.communityId,
        type: createdIncident.type,
        severity: createdIncident.severity,
        status: createdIncident.status,
        description: createdIncident.description,
        location: createdIncident.location,
        sectorId: createdIncident.sectorId,
        createdAt: createdIncident.createdAt,
      },
      alert: {
        id: alert.id,
        severity: alert.severity,
        message: alert.message,
      },
    };
  });
}

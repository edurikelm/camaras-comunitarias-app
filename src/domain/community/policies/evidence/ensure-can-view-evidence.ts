/**
 * Authorization policy for viewing evidence.
 *
 * Rule (CONTEXT.md §Evidence Rules):
 *   Only the incident creator, an ADMIN, or a GUARD can view evidence.
 *
 * Pattern B (ADR-0016 §3): the incident record is pre-loaded by the service
 * (which validates its existence with CommunityNotFoundError before calling
 * this policy). This policy assumes incident is valid and checks:
 *   1. community ACTIVE → CommunityNotFoundError/Invariant
 *   2. actor is creator → OR actor is ACTIVE ADMIN/GUARD
 * If incident is missing, the service has already returned 404.
 *
 * Errors:
 *   - CommunityNotFoundError("Community not found")
 *   - CommunityInvariantError("Community is not active")
 *   - CommunityAuthorizationError("Only the incident creator, an ADMIN, or a GUARD can view evidence")
 *
 * Returns the incident record on success.
 */

import type { EvidenceRepository } from "@/domain/community/evidence/evidence-repository";
import type { IncidentRecord } from "@/domain/community/evidence/evidence-repository";
import type { MembershipLookupsPort } from "@/domain/community/membership/membership-lookups";
import {
  CommunityAuthorizationError,
} from "@/domain/community/errors";
import { ensureActiveCommunity } from "../_helpers";

export type EnsureCanViewEvidenceOptions = {
  client: MembershipLookupsPort;
  actor: { id: string };
  incident: IncidentRecord;
  communityId: string;
};

/**
 * Validates the actor can view evidence for the given incident.
 * Returns the incident record on success.
 */
export async function ensureCanViewEvidence({
  client,
  actor,
  incident,
  communityId,
}: EnsureCanViewEvidenceOptions): Promise<{ incident: IncidentRecord }> {
  await ensureActiveCommunity(client, communityId);

  const isCreator = incident.createdById === actor.id;

  if (!isCreator) {
    const authorizedMember = await client.findActiveAdminOrGuardMember(
      communityId,
      actor.id,
    );
    if (!authorizedMember) {
      throw new CommunityAuthorizationError(
        "Only the incident creator, an ADMIN, or a GUARD can view evidence",
      );
    }
  }

  return { incident };
}

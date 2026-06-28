import { DomainError, type DomainErrorContext, type DomainErrorResponse } from "@/domain/shared/domain-error";

/**
 * Thrown when the actor does not have the required role/permission
 * for the operation (e.g. not an ACTIVE ADMIN of the community).
 */
export class CommunityAuthorizationError extends DomainError {
  constructor(message = "Not authorized for this community operation") {
    super(message);
    this.name = "CommunityAuthorizationError";
  }
  httpResponse(_ctx: DomainErrorContext): DomainErrorResponse {
    return { status: 403, body: { error: this.message } };
  }
}

/**
 * Thrown when a domain invariant is violated
 * (e.g. user already in a community, invitation already used, etc.).
 */
export class CommunityInvariantError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = "CommunityInvariantError";
  }
  httpResponse(_ctx: DomainErrorContext): DomainErrorResponse {
    return { status: 400, body: { error: this.message } };
  }
}

/**
 * Thrown when a community-scoped resource is not found
 * (e.g. camera, incident, membership, invitation, etc.).
 */
export class CommunityNotFoundError extends CommunityInvariantError {
  constructor(message: string) {
    super(message);
    this.name = "CommunityNotFoundError";
  }
  httpResponse(_ctx: DomainErrorContext): DomainErrorResponse {
    return { status: 404, body: { error: this.message } };
  }
}
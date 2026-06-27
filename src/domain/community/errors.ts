/**
 * Thrown when the actor does not have the required role/permission
 * for the operation (e.g. not an ACTIVE ADMIN of the community).
 */
export class CommunityAuthorizationError extends Error {
  constructor(message = "Not authorized for this community operation") {
    super(message);
    this.name = "CommunityAuthorizationError";
  }
}

/**
 * Thrown when a domain invariant is violated
 * (e.g. user already in a community, invitation already used, etc.).
 */
export class CommunityInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommunityInvariantError";
  }
}

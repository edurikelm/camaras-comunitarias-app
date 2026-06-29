/**
 * Nombres de rooms de Socket.IO. El cliente NUNCA elige rooms — el server
 * (services/realtime) une al usuario a las rooms que le corresponden en on-connection
 * (ver ADR-0017 seccion e).
 */

export const RoomPrefix = {
  Community: "community",
  Sector: "sector",
  User: "user",
  RoleAdminGuard: "role:admin-guard:community",
} as const;

export function communityRoom(communityId: string): string {
  return `${RoomPrefix.Community}:${communityId}`;
}

export function sectorRoom(sectorId: string): string {
  return `${RoomPrefix.Sector}:${sectorId}`;
}

export function userRoom(userId: string): string {
  return `${RoomPrefix.User}:${userId}`;
}

export function roleAdminGuardRoom(communityId: string): string {
  return `${RoomPrefix.RoleAdminGuard}:${communityId}`;
}

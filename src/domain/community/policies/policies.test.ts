import { describe, expect, it, vi } from "vitest";
import {
  CommunityAuthorizationError,
  CommunityInvariantError,
  CommunityNotFoundError,
} from "@/domain/community/errors";
import {
  ensureActiveCommunity,
  findAnyActiveMember,
} from "./_helpers";
import { ensureCanRegisterCamera } from "./camera/ensure-can-register-camera";
import { ensureCanReviewCamera } from "./camera/ensure-can-review-camera";
import { ensureCanSetPermission } from "./camera/ensure-can-set-permission";
import { ensureCanRemovePermission } from "./camera/ensure-can-remove-permission";
import { ensureActiveMemberWithLiveAccess } from "./camera/ensure-active-member-with-live-access";
import { ensureCanCreateIncident } from "./incident/ensure-can-create-incident";
import { ensureCanRequestRecording } from "./recording-request/ensure-can-request-recording";
import { ensureCanRespondRecording } from "./recording-request/ensure-can-respond-recording";
import { ensureCanUploadEvidence } from "./evidence/ensure-can-upload-evidence";
import { ensureCanViewEvidence } from "./evidence/ensure-can-view-evidence";
import { ensureCanApproveMember } from "./membership/ensure-can-approve-member";
import { ensureCanRejectMember } from "./membership/ensure-can-reject-member";
import { ensureCanCreateInvitation } from "./membership/ensure-can-create-invitation";
import { CommunityMemberRole, CommunityMemberStatus, CommunityStatus, CameraStatus, IncidentStatus } from "@/generated/prisma/enums";
import type { MembershipLookupsPort } from "@/domain/community/membership/membership-lookups";
import type { CommunityMembershipRepository } from "@/domain/community/community-repository";
import type { CommunityMemberRecord } from "@/domain/community/community-repository";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMembershipPort(
  overrides: Partial<MembershipLookupsPort> = {},
): MembershipLookupsPort {
  return {
    findCommunityById: vi.fn(async () => ({
      id: "community-1",
      name: "Barrio Norte",
      status: CommunityStatus.ACTIVE,
    })),
    findActiveAdminMember: vi.fn(async (cid, uid) => {
      if (uid === "user-admin-1") {
        return {
          id: "member-admin-1",
          userId: "user-admin-1",
          communityId: cid,
          role: CommunityMemberRole.ADMIN,
          status: CommunityMemberStatus.ACTIVE,
        };
      }
      return null;
    }),
    findActiveNeighborOrGuardMember: vi.fn(async (cid, uid) => {
      if (uid === "user-neighbor-1") {
        return {
          id: "member-neighbor-1",
          userId: "user-neighbor-1",
          communityId: cid,
          role: CommunityMemberRole.NEIGHBOR,
          status: CommunityMemberStatus.ACTIVE,
        };
      }
      if (uid === "user-guard-1") {
        return {
          id: "member-guard-1",
          userId: "user-guard-1",
          communityId: cid,
          role: CommunityMemberRole.GUARD,
          status: CommunityMemberStatus.ACTIVE,
        };
      }
      return null;
    }),
    findActiveMember: vi.fn(async (cid, uid) => {
      if (uid === "user-neighbor-1" || uid === "user-admin-1" || uid === "user-guard-1") {
        return {
          id: `member-${uid}`,
          userId: uid,
          communityId: cid,
          role: uid === "user-admin-1" ? CommunityMemberRole.ADMIN : CommunityMemberRole.NEIGHBOR,
          status: CommunityMemberStatus.ACTIVE,
        };
      }
      return null;
    }),
    findActiveAdminOrGuardMember: vi.fn(async (cid, uid) => {
      if (uid === "user-admin-1") {
        return {
          id: "member-admin-1",
          userId: "user-admin-1",
          communityId: cid,
          role: CommunityMemberRole.ADMIN,
          status: CommunityMemberStatus.ACTIVE,
        };
      }
      if (uid === "user-guard-1") {
        return {
          id: "member-guard-1",
          userId: "user-guard-1",
          communityId: cid,
          role: CommunityMemberRole.GUARD,
          status: CommunityMemberStatus.ACTIVE,
        };
      }
      return null;
    }),
    findSectorById: vi.fn(),
    ...overrides,
  };
}

/** Minimal camera record for tests */
const ACTIVE_CAMERA = {
  id: "camera-1",
  communityId: "community-1",
  ownerId: "user-owner",
  sectorId: null,
  name: "Camera",
  description: null,
  approximateLocation: null,
  status: CameraStatus.ACTIVE,
  technicalStatus: null,
  reviewNote: null,
};

function createCommunityMembershipRepo(
  overrides: Partial<CommunityMembershipRepository> = {},
): CommunityMembershipRepository {
  const repo = createMembershipPort() as CommunityMembershipRepository;
  Object.assign(repo, {
    findCommunityMemberById: vi.fn(async (id: string) => {
      if (id === "member-pending-1") {
        return {
          id: "member-pending-1",
          userId: "user-new-1",
          communityId: "community-1",
          role: CommunityMemberRole.NEIGHBOR,
          status: CommunityMemberStatus.PENDING,
        } as CommunityMemberRecord;
      }
      if (id === "member-other-community") {
        return {
          id: "member-other-community",
          userId: "user-other",
          communityId: "other-community",
          role: CommunityMemberRole.NEIGHBOR,
          status: CommunityMemberStatus.PENDING,
        } as CommunityMemberRecord;
      }
      if (id === "member-active-1") {
        return {
          id: "member-active-1",
          userId: "user-active-1",
          communityId: "community-1",
          role: CommunityMemberRole.NEIGHBOR,
          status: CommunityMemberStatus.ACTIVE,
        } as CommunityMemberRecord;
      }
      return null;
    }),
    findCommunityMemberByUserId: vi.fn(),
    findInvitationByCodeHash: vi.fn(),
    createCommunityInvitation: vi.fn(),
    markInvitationUsedIfAvailable: vi.fn(),
    createCommunityMember: vi.fn(),
    updateCommunityMember: vi.fn(),
    createAuditLog: vi.fn(),
    runInTransaction: vi.fn(async (op) => op(repo)),
    ...overrides,
  });
  return repo;
}

// ---------------------------------------------------------------------------
// _helpers
// ---------------------------------------------------------------------------

describe("ensureActiveCommunity (helper)", () => {
  it("passes when community is ACTIVE", async () => {
    const client = createMembershipPort();
    await expect(
      ensureActiveCommunity(client, "community-1"),
    ).resolves.toBeUndefined();
  });

  it("throws CommunityNotFoundError when community does not exist", async () => {
    const client = createMembershipPort({
      findCommunityById: vi.fn(async () => null),
    });
    await expect(
      ensureActiveCommunity(client, "nonexistent"),
    ).rejects.toThrow(CommunityNotFoundError);
  });

  it("throws CommunityInvariantError when community is not ACTIVE", async () => {
    const client = createMembershipPort({
      findCommunityById: vi.fn(async () => ({
        id: "community-1",
        name: "Barrio Norte",
        status: CommunityStatus.SUSPENDED,
      })),
    });
    await expect(
      ensureActiveCommunity(client, "community-1"),
    ).rejects.toThrow(CommunityInvariantError);
    await expect(
      ensureActiveCommunity(client, "community-1"),
    ).rejects.toThrow("Community is not active");
  });
});

describe("findAnyActiveMember (helper)", () => {
  it("returns neighbor/guard member when found", async () => {
    const client = createMembershipPort();
    const result = await findAnyActiveMember(client, "community-1", "user-neighbor-1");
    expect(result).not.toBeNull();
    expect(result!.role).toBe(CommunityMemberRole.NEIGHBOR);
  });

  it("falls back to admin when neighbor/guard not found", async () => {
    const client = createMembershipPort();
    const result = await findAnyActiveMember(client, "community-1", "user-admin-1");
    expect(result).not.toBeNull();
    expect(result!.role).toBe(CommunityMemberRole.ADMIN);
  });

  it("returns null when no active membership exists", async () => {
    const client = createMembershipPort();
    const result = await findAnyActiveMember(client, "community-1", "user-unknown");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ensureCanRegisterCamera
// ---------------------------------------------------------------------------

describe("ensureCanRegisterCamera", () => {
  it("passes when actor is ACTIVE NEIGHBOR", async () => {
    const client = createMembershipPort();
    await expect(
      ensureCanRegisterCamera({
        client,
        actor: { id: "user-neighbor-1" },
        communityId: "community-1",
      }),
    ).resolves.toBeUndefined();
  });

  it("throws CommunityAuthorizationError when actor is not a member", async () => {
    const client = createMembershipPort({
      findActiveNeighborOrGuardMember: vi.fn(async () => null),
      findActiveAdminMember: vi.fn(async () => null),
    });
    await expect(
      ensureCanRegisterCamera({
        client,
        actor: { id: "user-unknown" },
        communityId: "community-1",
      }),
    ).rejects.toThrow(CommunityAuthorizationError);
    await expect(
      ensureCanRegisterCamera({
        client,
        actor: { id: "user-unknown" },
        communityId: "community-1",
      }),
    ).rejects.toThrow("Only an ACTIVE NEIGHBOR, GUARD, or ADMIN can register a camera");
  });
});

// ---------------------------------------------------------------------------
// ensureCanReviewCamera
// ---------------------------------------------------------------------------

describe("ensureCanReviewCamera", () => {
  const mockClientWithCamera = (cameraStatus = CameraStatus.PENDING_REVIEW, ownerId = "user-owner") =>
    createMembershipPort({
      findActiveAdminMember: vi.fn(async () => ({
        id: "member-admin-1",
        userId: "user-admin-1",
        communityId: "community-1",
        role: CommunityMemberRole.ADMIN,
        status: CommunityMemberStatus.ACTIVE,
      })),
    });

  it("throws CommunityNotFoundError when camera does not exist", async () => {
    const client = mockClientWithCamera();
    const findCameraById = vi.fn(async () => null);
    await expect(
      ensureCanReviewCamera({
        client: { ...client, findCameraById },
        actor: { id: "user-admin-1" },
        cameraId: "camera-missing",
        communityId: "community-1",
      }),
    ).rejects.toThrow(CommunityNotFoundError);
  });

  it("throws CommunityAuthorizationError when actor is not ADMIN", async () => {
    const client = createMembershipPort({
      findActiveAdminMember: vi.fn(async () => null),
    });
    const findCameraById = vi.fn(async () => ACTIVE_CAMERA);
    await expect(
      ensureCanReviewCamera({
        client: client as typeof client & { findCameraById: typeof findCameraById },
        actor: { id: "user-neighbor-1" },
        cameraId: "camera-1",
        communityId: "community-1",
      }),
    ).rejects.toThrow(CommunityAuthorizationError);
    await expect(
      ensureCanReviewCamera({
        client: client as typeof client & { findCameraById: typeof findCameraById },
        actor: { id: "user-neighbor-1" },
        cameraId: "camera-1",
        communityId: "community-1",
      }),
    ).rejects.toThrow("Only an ACTIVE ADMIN can review cameras");
  });

  it("throws CommunityAuthorizationError when actor is the camera owner", async () => {
    const client = mockClientWithCamera();
    const findCameraById = vi.fn(async () => ({
      id: "camera-1",
      communityId: "community-1",
      ownerId: "user-admin-1", // same as actor
      sectorId: null,
      name: "Front Door",
      description: null,
      approximateLocation: null,
      status: CameraStatus.PENDING_REVIEW,
      technicalStatus: null,
      reviewNote: null,
    }));
    await expect(
      ensureCanReviewCamera({
        client: { ...client, findCameraById },
        actor: { id: "user-admin-1" },
        cameraId: "camera-1",
        communityId: "community-1",
      }),
    ).rejects.toThrow(CommunityAuthorizationError);
    await expect(
      ensureCanReviewCamera({
        client: { ...client, findCameraById },
        actor: { id: "user-admin-1" },
        cameraId: "camera-1",
        communityId: "community-1",
      }),
    ).rejects.toThrow("An ADMIN cannot review their own camera");
  });

  it("returns { camera } when ACTIVE ADMIN reviews another member's PENDING_REVIEW camera", async () => {
    const cameraRecord = {
      id: "camera-1",
      communityId: "community-1",
      ownerId: "user-owner",
      sectorId: null,
      name: "Front Door",
      description: null,
      approximateLocation: null,
      status: CameraStatus.PENDING_REVIEW,
      technicalStatus: null,
      reviewNote: null,
    };
    const client = mockClientWithCamera();
    const findCameraById = vi.fn(async () => cameraRecord);
    const result = await ensureCanReviewCamera({
      client: { ...client, findCameraById },
      actor: { id: "user-admin-1" },
      cameraId: "camera-1",
      communityId: "community-1",
    });
    expect(result.camera).toMatchObject({ id: "camera-1", ownerId: "user-owner" });
  });
});

// ---------------------------------------------------------------------------
// ensureCanSetPermission
// ---------------------------------------------------------------------------

describe("ensureCanSetPermission", () => {
  it("throws CommunityNotFoundError when camera does not exist", async () => {
    const client = createMembershipPort();
    const findCameraById = vi.fn(async () => null);
    await expect(
      ensureCanSetPermission({
        client: { ...client, findCameraById },
        actor: { id: "user-admin-1" },
        cameraId: "camera-nonexistent",
        communityId: "community-1",
      }),
    ).rejects.toThrow(CommunityNotFoundError);
    await expect(
      ensureCanSetPermission({
        client: { ...client, findCameraById },
        actor: { id: "user-admin-1" },
        cameraId: "camera-nonexistent",
        communityId: "community-1",
      }),
    ).rejects.toThrow("Camera not found");
  });

  it("throws CommunityAuthorizationError when actor is not the camera owner", async () => {
    const client = createMembershipPort();
    const findCameraById = vi.fn(async () => ({
      id: "camera-1",
      communityId: "community-1",
      ownerId: "user-other-owner",
      sectorId: null,
      name: "Camera",
      description: null,
      approximateLocation: null,
      status: CameraStatus.ACTIVE,
      technicalStatus: null,
      reviewNote: null,
    }));
    await expect(
      ensureCanSetPermission({
        client: { ...client, findCameraById },
        actor: { id: "user-neighbor-1" },
        cameraId: "camera-1",
        communityId: "community-1",
      }),
    ).rejects.toThrow(CommunityAuthorizationError);
    await expect(
      ensureCanSetPermission({
        client: { ...client, findCameraById },
        actor: { id: "user-neighbor-1" },
        cameraId: "camera-1",
        communityId: "community-1",
      }),
    ).rejects.toThrow("Only the camera owner can set permissions");
  });

  it("returns { camera } when ACTIVE OWNER sets permission", async () => {
    // Override findActiveNeighborOrGuardMember to recognize user-owner as an active member
    const client = createMembershipPort({
      findActiveNeighborOrGuardMember: vi.fn(async (cid, uid) => {
        if (uid === "user-owner") {
          return {
            id: "member-owner",
            userId: "user-owner",
            communityId: cid,
            role: CommunityMemberRole.NEIGHBOR,
            status: CommunityMemberStatus.ACTIVE,
          };
        }
        return null;
      }),
    });
    const findCameraById = vi.fn(async () => ({
      id: "camera-1",
      communityId: "community-1",
      ownerId: "user-owner",
      sectorId: null,
      name: "Camera",
      description: null,
      approximateLocation: null,
      status: CameraStatus.ACTIVE,
      technicalStatus: null,
      reviewNote: null,
    }));
    const result = await ensureCanSetPermission({
      client: { ...client, findCameraById },
      actor: { id: "user-owner" },
      cameraId: "camera-1",
      communityId: "community-1",
    });
    expect(result.camera).toMatchObject({ id: "camera-1", ownerId: "user-owner" });
  });
});

// ---------------------------------------------------------------------------
// ensureCanRemovePermission
// ---------------------------------------------------------------------------

describe("ensureCanRemovePermission", () => {
  it("throws CommunityNotFoundError when camera does not exist", async () => {
    const client = createMembershipPort();
    const findCameraById = vi.fn(async () => null);
    await expect(
      ensureCanRemovePermission({
        client: { ...client, findCameraById },
        actor: { id: "user-admin-1" },
        cameraId: "camera-nonexistent",
        communityId: "community-1",
      }),
    ).rejects.toThrow(CommunityNotFoundError);
    await expect(
      ensureCanRemovePermission({
        client: { ...client, findCameraById },
        actor: { id: "user-admin-1" },
        cameraId: "camera-nonexistent",
        communityId: "community-1",
      }),
    ).rejects.toThrow("Camera not found");
  });

  it("throws CommunityAuthorizationError when actor is not the camera owner", async () => {
    const client = createMembershipPort();
    const findCameraById = vi.fn(async () => ({
      id: "camera-1",
      communityId: "community-1",
      ownerId: "user-other-owner",
      sectorId: null,
      name: "Camera",
      description: null,
      approximateLocation: null,
      status: CameraStatus.ACTIVE,
      technicalStatus: null,
      reviewNote: null,
    }));
    await expect(
      ensureCanRemovePermission({
        client: { ...client, findCameraById },
        actor: { id: "user-neighbor-1" },
        cameraId: "camera-1",
        communityId: "community-1",
      }),
    ).rejects.toThrow(CommunityAuthorizationError);
    await expect(
      ensureCanRemovePermission({
        client: { ...client, findCameraById },
        actor: { id: "user-neighbor-1" },
        cameraId: "camera-1",
        communityId: "community-1",
      }),
    ).rejects.toThrow("Only the camera owner can remove permissions");
  });

  it("returns { camera } when ACTIVE OWNER removes permission", async () => {
    // Override findActiveNeighborOrGuardMember to recognize user-owner as an active member
    const client = createMembershipPort({
      findActiveNeighborOrGuardMember: vi.fn(async (cid, uid) => {
        if (uid === "user-owner") {
          return {
            id: "member-owner",
            userId: "user-owner",
            communityId: cid,
            role: CommunityMemberRole.NEIGHBOR,
            status: CommunityMemberStatus.ACTIVE,
          };
        }
        return null;
      }),
    });
    const findCameraById = vi.fn(async () => ({
      id: "camera-1",
      communityId: "community-1",
      ownerId: "user-owner",
      sectorId: null,
      name: "Camera",
      description: null,
      approximateLocation: null,
      status: CameraStatus.ACTIVE,
      technicalStatus: null,
      reviewNote: null,
    }));
    const result = await ensureCanRemovePermission({
      client: { ...client, findCameraById },
      actor: { id: "user-owner" },
      cameraId: "camera-1",
      communityId: "community-1",
    });
    expect(result.camera).toMatchObject({ id: "camera-1", ownerId: "user-owner" });
  });
});

// ---------------------------------------------------------------------------
// ensureActiveMemberWithLiveAccess
// ---------------------------------------------------------------------------

describe("ensureActiveMemberWithLiveAccess", () => {
  it("throws CommunityNotFoundError when camera does not exist", async () => {
    const client = createMembershipPort({
      findActiveNeighborOrGuardMember: vi.fn(async (cid, uid) => {
        if (uid === "user-owner") {
          return {
            id: "member-owner",
            userId: "user-owner",
            communityId: cid,
            role: CommunityMemberRole.NEIGHBOR,
            status: CommunityMemberStatus.ACTIVE,
          };
        }
        return null;
      }),
      findActiveAdminMember: vi.fn(async () => null),
    });
    const findCameraById = vi.fn(async () => null);
    const findPermissionByCameraAndRole = vi.fn(async () => null);
    const findPermissionByCameraAndUser = vi.fn(async () => null);
    await expect(
      ensureActiveMemberWithLiveAccess({
        client: {
          ...client,
          findCameraById,
          findPermissionByCameraAndRole,
          findPermissionByCameraAndUser,
        },
        actor: { id: "user-owner" },
        cameraId: "camera-nonexistent",
      }),
    ).rejects.toThrow(CommunityNotFoundError);
    await expect(
      ensureActiveMemberWithLiveAccess({
        client: {
          ...client,
          findCameraById,
          findPermissionByCameraAndRole,
          findPermissionByCameraAndUser,
        },
        actor: { id: "user-owner" },
        cameraId: "camera-nonexistent",
      }),
    ).rejects.toThrow("Camera not found");
  });

  it("passes when ACTIVE ADMIN (admin shortcut, no permission lookup needed)", async () => {
    const client = createMembershipPort({
      findActiveAdminMember: vi.fn(async (cid, uid) => {
        if (uid === "user-admin-1") {
          return {
            id: "member-admin-1",
            userId: "user-admin-1",
            communityId: cid,
            role: CommunityMemberRole.ADMIN,
            status: CommunityMemberStatus.ACTIVE,
          };
        }
        return null;
      }),
      findActiveNeighborOrGuardMember: vi.fn(async () => null),
    });
    const findCameraById = vi.fn(async () => ({
      id: "camera-1",
      communityId: "community-1",
      ownerId: "user-owner",
      sectorId: null,
      name: "Camera",
      description: null,
      approximateLocation: null,
      status: CameraStatus.ACTIVE,
      technicalStatus: null,
      reviewNote: null,
    }));
    const findPermissionByCameraAndRole = vi.fn(async () => null);
    const findPermissionByCameraAndUser = vi.fn(async () => null);
    await expect(
      ensureActiveMemberWithLiveAccess({
        client: {
          ...client,
          findCameraById,
          findPermissionByCameraAndRole,
          findPermissionByCameraAndUser,
        },
        actor: { id: "user-admin-1" },
        cameraId: "camera-1",
      }),
    ).resolves.toMatchObject({
      member: expect.objectContaining({ id: "member-admin-1", role: CommunityMemberRole.ADMIN }),
    });
  });

  it("passes when ACTIVE NEIGHBOR with role permission canViewLive=true within schedule", async () => {
    const client = createMembershipPort({
      findActiveNeighborOrGuardMember: vi.fn(async (cid, uid) => {
        if (uid === "user-neighbor-1") {
          return {
            id: "member-neighbor-1",
            userId: "user-neighbor-1",
            communityId: cid,
            role: CommunityMemberRole.NEIGHBOR,
            status: CommunityMemberStatus.ACTIVE,
          };
        }
        return null;
      }),
      findActiveAdminMember: vi.fn(async () => null),
    });
    const findCameraById = vi.fn(async () => ({
      id: "camera-1",
      communityId: "community-1",
      ownerId: "user-owner",
      sectorId: null,
      name: "Camera",
      description: null,
      approximateLocation: null,
      status: CameraStatus.ACTIVE,
      technicalStatus: null,
      reviewNote: null,
    }));
    // Mock role permission: NEIGHBOR role has canViewLive=true with a wide schedule
    const findPermissionByCameraAndRole = vi.fn(async () => ({
      id: "perm-role-1",
      cameraId: "camera-1",
      roleAllowed: CommunityMemberRole.NEIGHBOR,
      userIdAllowed: null,
      canViewLive: true,
      canRequestRecordings: false,
      scheduleStart: "00:00",
      scheduleEnd: "23:59",
    }));
    const findPermissionByCameraAndUser = vi.fn(async () => null);
    await expect(
      ensureActiveMemberWithLiveAccess({
        client: {
          ...client,
          findCameraById,
          findPermissionByCameraAndRole,
          findPermissionByCameraAndUser,
        },
        actor: { id: "user-neighbor-1" },
        cameraId: "camera-1",
      }),
    ).resolves.toMatchObject({
      member: expect.objectContaining({ id: "member-neighbor-1", role: CommunityMemberRole.NEIGHBOR }),
    });
  });

  it("throws CommunityAuthorizationError when actor has no live access permission", async () => {
    const client = createMembershipPort({
      findActiveNeighborOrGuardMember: vi.fn(async (cid, uid) => {
        if (uid === "user-no-perm") {
          return {
            id: "member-no-perm",
            userId: "user-no-perm",
            communityId: cid,
            role: CommunityMemberRole.NEIGHBOR,
            status: CommunityMemberStatus.ACTIVE,
          };
        }
        return null;
      }),
      findActiveAdminMember: vi.fn(async () => null),
    });
    const findCameraById = vi.fn(async () => ({
      id: "camera-1",
      communityId: "community-1",
      ownerId: "user-owner",
      sectorId: null,
      name: "Camera",
      description: null,
      approximateLocation: null,
      status: CameraStatus.ACTIVE,
      technicalStatus: null,
      reviewNote: null,
    }));
    const findPermissionByCameraAndRole = vi.fn(async () => null);
    const findPermissionByCameraAndUser = vi.fn(async () => null);
    await expect(
      ensureActiveMemberWithLiveAccess({
        client: {
          ...client,
          findCameraById,
          findPermissionByCameraAndRole,
          findPermissionByCameraAndUser,
        },
        actor: { id: "user-no-perm" },
        cameraId: "camera-1",
      }),
    ).rejects.toThrow(CommunityAuthorizationError);
    await expect(
      ensureActiveMemberWithLiveAccess({
        client: {
          ...client,
          findCameraById,
          findPermissionByCameraAndRole,
          findPermissionByCameraAndUser,
        },
        actor: { id: "user-no-perm" },
        cameraId: "camera-1",
      }),
    ).rejects.toThrow("You do not have permission to view this camera's live stream");
  });
});

// ---------------------------------------------------------------------------
// ensureCanCreateIncident
// ---------------------------------------------------------------------------

describe("ensureCanCreateIncident", () => {
  it("throws CommunityAuthorizationError when actor is not an ACTIVE member", async () => {
    const client = createMembershipPort({
      findActiveMember: vi.fn(async () => null),
    });
    await expect(
      ensureCanCreateIncident({
        client,
        actor: { id: "user-unknown" },
        communityId: "community-1",
      }),
    ).rejects.toThrow(CommunityAuthorizationError);
    await expect(
      ensureCanCreateIncident({
        client,
        actor: { id: "user-unknown" },
        communityId: "community-1",
      }),
    ).rejects.toThrow("Only an ACTIVE community member can create an incident");
  });

  it("passes when actor is ACTIVE NEIGHBOR", async () => {
    const client = createMembershipPort();
    await expect(
      ensureCanCreateIncident({
        client,
        actor: { id: "user-neighbor-1" },
        communityId: "community-1",
      }),
    ).resolves.toBeUndefined();
  });

  it("passes when actor is ACTIVE GUARD", async () => {
    const client = createMembershipPort();
    await expect(
      ensureCanCreateIncident({
        client,
        actor: { id: "user-guard-1" },
        communityId: "community-1",
      }),
    ).resolves.toBeUndefined();
  });

  it("passes when actor is ACTIVE ADMIN (ADMIN incluye capacidades de NEIGHBOR)", async () => {
    const client = createMembershipPort();
    await expect(
      ensureCanCreateIncident({
        client,
        actor: { id: "user-admin-1" },
        communityId: "community-1",
      }),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ensureCanRequestRecording
// ---------------------------------------------------------------------------

describe("ensureCanRequestRecording", () => {
  it("throws CommunityAuthorizationError when actor is not creator/admin/guard", async () => {
    const client = createMembershipPort({
      findActiveNeighborOrGuardMember: vi.fn(async (cid, uid) => {
        if (uid === "user-neighbor-1") {
          return {
            id: "member-neighbor-1",
            userId: "user-neighbor-1",
            communityId: cid,
            role: CommunityMemberRole.NEIGHBOR,
            status: CommunityMemberStatus.ACTIVE,
          };
        }
        return null;
      }),
    });
    const findIncidentById = vi.fn(async () => ({
      id: "incident-1",
      communityId: "community-1",
      createdById: "user-other-creator",
      status: IncidentStatus.OPEN,
    }));
    const findCameraById = vi.fn(async () => ({
      id: "camera-1",
      communityId: "community-1",
      ownerId: "user-owner",
      status: CameraStatus.ACTIVE,
    }));
    await expect(
      ensureCanRequestRecording({
        client: { ...client, findIncidentById, findCameraById },
        actor: { id: "user-neighbor-1" },
        incidentId: "incident-1",
        cameraId: "camera-1",
      }),
    ).rejects.toThrow(CommunityAuthorizationError);
    await expect(
      ensureCanRequestRecording({
        client: { ...client, findIncidentById, findCameraById },
        actor: { id: "user-neighbor-1" },
        incidentId: "incident-1",
        cameraId: "camera-1",
      }),
    ).rejects.toThrow("Only the incident creator, ADMIN, or GUARD can request recordings");
  });
});

// ---------------------------------------------------------------------------
// ensureCanRespondRecording
// ---------------------------------------------------------------------------

describe("ensureCanRespondRecording", () => {
  it("throws CommunityNotFoundError('Camera not found') when camera does not exist", async () => {
    const client = createMembershipPort();
    const findCameraById = vi.fn(async () => null);
    const findIncidentById = vi.fn(async () => ({
      id: "incident-1",
      communityId: "community-1",
      createdById: "user-creator",
      status: IncidentStatus.OPEN,
    }));
    await expect(
      ensureCanRespondRecording({
        client: { ...client, findCameraById, findIncidentById },
        actor: { id: "user-owner" },
        request: {
          id: "request-1",
          incidentId: "incident-1",
          cameraId: "camera-nonexistent",
          requestedById: "user-requester",
          ownerId: "user-owner",
          startTime: new Date(),
          endTime: new Date(),
          reason: "Investigation",
          status: "PENDING",
          ownerComment: null,
          createdAt: new Date(),
        },
      }),
    ).rejects.toThrow(CommunityNotFoundError);
    await expect(
      ensureCanRespondRecording({
        client: { ...client, findCameraById, findIncidentById },
        actor: { id: "user-owner" },
        request: {
          id: "request-1",
          incidentId: "incident-1",
          cameraId: "camera-nonexistent",
          requestedById: "user-requester",
          ownerId: "user-owner",
          startTime: new Date(),
          endTime: new Date(),
          reason: "Investigation",
          status: "PENDING",
          ownerComment: null,
          createdAt: new Date(),
        },
      }),
    ).rejects.toThrow("Camera not found");
  });

  it("throws CommunityNotFoundError('Incident not found for recording request') when incident does not exist", async () => {
    const client = createMembershipPort();
    const findCameraById = vi.fn(async () => ({
      id: "camera-1",
      communityId: "community-1",
      ownerId: "user-owner",
      status: CameraStatus.ACTIVE,
    }));
    const findIncidentById = vi.fn(async () => null);
    await expect(
      ensureCanRespondRecording({
        client: { ...client, findCameraById, findIncidentById },
        actor: { id: "user-owner" },
        request: {
          id: "request-1",
          incidentId: "incident-nonexistent",
          cameraId: "camera-1",
          requestedById: "user-requester",
          ownerId: "user-owner",
          startTime: new Date(),
          endTime: new Date(),
          reason: "Investigation",
          status: "PENDING",
          ownerComment: null,
          createdAt: new Date(),
        },
      }),
    ).rejects.toThrow(CommunityNotFoundError);
    await expect(
      ensureCanRespondRecording({
        client: { ...client, findCameraById, findIncidentById },
        actor: { id: "user-owner" },
        request: {
          id: "request-1",
          incidentId: "incident-nonexistent",
          cameraId: "camera-1",
          requestedById: "user-requester",
          ownerId: "user-owner",
          startTime: new Date(),
          endTime: new Date(),
          reason: "Investigation",
          status: "PENDING",
          ownerComment: null,
          createdAt: new Date(),
        },
      }),
    ).rejects.toThrow("Incident not found for recording request");
  });

  it("throws CommunityAuthorizationError when actor is not camera owner", async () => {
    const client = createMembershipPort();
    const findCameraById = vi.fn(async () => ({
      id: "camera-1",
      communityId: "community-1",
      ownerId: "user-actual-owner",
      status: CameraStatus.ACTIVE,
    }));
    const findIncidentById = vi.fn(async () => ({
      id: "incident-1",
      communityId: "community-1",
      createdById: "user-creator",
      status: IncidentStatus.OPEN,
    }));
    await expect(
      ensureCanRespondRecording({
        client: { ...client, findCameraById, findIncidentById },
        actor: { id: "user-not-owner" },
        request: {
          id: "request-1",
          incidentId: "incident-1",
          cameraId: "camera-1",
          requestedById: "user-requester",
          ownerId: "user-actual-owner",
          startTime: new Date(),
          endTime: new Date(),
          reason: "Investigation",
          status: "PENDING",
          ownerComment: null,
          createdAt: new Date(),
        },
      }),
    ).rejects.toThrow(CommunityAuthorizationError);
    await expect(
      ensureCanRespondRecording({
        client: { ...client, findCameraById, findIncidentById },
        actor: { id: "user-not-owner" },
        request: {
          id: "request-1",
          incidentId: "incident-1",
          cameraId: "camera-1",
          requestedById: "user-requester",
          ownerId: "user-actual-owner",
          startTime: new Date(),
          endTime: new Date(),
          reason: "Investigation",
          status: "PENDING",
          ownerComment: null,
          createdAt: new Date(),
        },
      }),
    ).rejects.toThrow("Only the camera owner can respond to a recording request");
  });
});

// ---------------------------------------------------------------------------
// ensureCanUploadEvidence
// ---------------------------------------------------------------------------

describe("ensureCanUploadEvidence", () => {
  it("throws CommunityAuthorizationError when actor is not an active member", async () => {
    const client = createMembershipPort({
      findActiveMember: vi.fn(async () => null),
    });
    await expect(
      ensureCanUploadEvidence({
        client,
        actor: { id: "user-unknown" },
        communityId: "community-1",
      }),
    ).rejects.toThrow(CommunityAuthorizationError);
    await expect(
      ensureCanUploadEvidence({
        client,
        actor: { id: "user-unknown" },
        communityId: "community-1",
      }),
    ).rejects.toThrow("Only an ACTIVE community member can upload evidence");
  });
});

// ---------------------------------------------------------------------------
// ensureCanViewEvidence
// ---------------------------------------------------------------------------

describe("ensureCanViewEvidence", () => {
  it("throws CommunityAuthorizationError when actor is not creator/admin/guard", async () => {
    const client = createMembershipPort();
    await expect(
      ensureCanViewEvidence({
        client,
        actor: { id: "user-neighbor-1" },
        incident: {
          id: "incident-1",
          communityId: "community-1",
          createdById: "user-creator",
          status: IncidentStatus.OPEN,
        },
        communityId: "community-1",
      }),
    ).rejects.toThrow(CommunityAuthorizationError);
    await expect(
      ensureCanViewEvidence({
        client,
        actor: { id: "user-neighbor-1" },
        incident: {
          id: "incident-1",
          communityId: "community-1",
          createdById: "user-creator",
          status: IncidentStatus.OPEN,
        },
        communityId: "community-1",
      }),
    ).rejects.toThrow("Only the incident creator, an ADMIN, or a GUARD can view evidence");
  });

  it("passes when actor is the incident creator", async () => {
    const client = createMembershipPort();
    await expect(
      ensureCanViewEvidence({
        client,
        actor: { id: "user-creator" },
        incident: {
          id: "incident-1",
          communityId: "community-1",
          createdById: "user-creator",
          status: IncidentStatus.OPEN,
        },
        communityId: "community-1",
      }),
    ).resolves.toMatchObject({
      incident: expect.objectContaining({ id: "incident-1" }),
    });
  });
});

// ---------------------------------------------------------------------------
// ensureCanApproveMember
// ---------------------------------------------------------------------------

describe("ensureCanApproveMember", () => {
  it("throws CommunityAuthorizationError when actor is not ADMIN", async () => {
    const repo = createCommunityMembershipRepo({
      findActiveAdminMember: vi.fn(async () => null),
    });
    await expect(
      ensureCanApproveMember({
        client: repo,
        actor: { id: "user-neighbor-1" },
        communityId: "community-1",
        memberId: "member-pending-1",
      }),
    ).rejects.toThrow(CommunityAuthorizationError);
    await expect(
      ensureCanApproveMember({
        client: repo,
        actor: { id: "user-neighbor-1" },
        communityId: "community-1",
        memberId: "member-pending-1",
      }),
    ).rejects.toThrow("Only an ACTIVE ADMIN can approve members");
  });

  it("throws CommunityNotFoundError when target member does not exist", async () => {
    const repo = createCommunityMembershipRepo();
    await expect(
      ensureCanApproveMember({
        client: repo,
        actor: { id: "user-admin-1" },
        communityId: "community-1",
        memberId: "member-nonexistent",
      }),
    ).rejects.toThrow(CommunityNotFoundError);
  });

  it("throws CommunityInvariantError when target member is not PENDING", async () => {
    const repo = createCommunityMembershipRepo();
    // Override findCommunityMemberById to return an ACTIVE member
    (repo.findCommunityMemberById as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async () => ({
        id: "member-active-1",
        userId: "user-active-1",
        communityId: "community-1",
        role: CommunityMemberRole.NEIGHBOR,
        status: CommunityMemberStatus.ACTIVE,
      } as CommunityMemberRecord),
    );
    await expect(
      ensureCanApproveMember({
        client: repo,
        actor: { id: "user-admin-1" },
        communityId: "community-1",
        memberId: "member-active-1",
      }),
    ).rejects.toThrow(CommunityInvariantError);
    await expect(
      ensureCanApproveMember({
        client: repo,
        actor: { id: "user-admin-1" },
        communityId: "community-1",
        memberId: "member-active-1",
      }),
    ).rejects.toThrow("Only PENDING members can be approved");
  });
});

// ---------------------------------------------------------------------------
// ensureCanRejectMember
// ---------------------------------------------------------------------------

describe("ensureCanRejectMember", () => {
  it("throws CommunityAuthorizationError when actor is not ADMIN", async () => {
    const repo = createCommunityMembershipRepo({
      findActiveAdminMember: vi.fn(async () => null),
    });
    await expect(
      ensureCanRejectMember({
        client: repo,
        actor: { id: "user-neighbor-1" },
        communityId: "community-1",
        memberId: "member-pending-1",
      }),
    ).rejects.toThrow(CommunityAuthorizationError);
    await expect(
      ensureCanRejectMember({
        client: repo,
        actor: { id: "user-neighbor-1" },
        communityId: "community-1",
        memberId: "member-pending-1",
      }),
    ).rejects.toThrow("Only an ACTIVE ADMIN can reject members");
  });
});

// ---------------------------------------------------------------------------
// ensureCanCreateInvitation
// ---------------------------------------------------------------------------

describe("ensureCanCreateInvitation", () => {
  it("throws CommunityAuthorizationError when actor is not ADMIN", async () => {
    const client = createMembershipPort({
      findActiveAdminMember: vi.fn(async () => null),
    });
    await expect(
      ensureCanCreateInvitation({
        client,
        actor: { id: "user-neighbor-1" },
        communityId: "community-1",
      }),
    ).rejects.toThrow(CommunityAuthorizationError);
    await expect(
      ensureCanCreateInvitation({
        client,
        actor: { id: "user-neighbor-1" },
        communityId: "community-1",
      }),
    ).rejects.toThrow("Only an ACTIVE ADMIN can create invitations");
  });

  it("passes when actor is ACTIVE ADMIN", async () => {
    const client = createMembershipPort();
    await expect(
      ensureCanCreateInvitation({
        client,
        actor: { id: "user-admin-1" },
        communityId: "community-1",
      }),
    ).resolves.toBeUndefined();
  });
});

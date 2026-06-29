import { z } from "zod";

export const MemberStatusSchema = z.enum(["PENDING", "ACTIVE", "BLOCKED"]);
export type MemberStatus = z.infer<typeof MemberStatusSchema>;

export const MemberStatusChangedSchema = z.object({
  userId: z.string().uuid(),
  communityId: z.string().uuid(),
  previousStatus: MemberStatusSchema,
  newStatus: MemberStatusSchema,
  changedById: z.string().uuid(),
  changedAt: z.string().datetime(),
});
export type MemberStatusChangedPayload = z.infer<typeof MemberStatusChangedSchema>;

import { z } from "zod";

export const RecordingRequestStatusSchema = z.enum(["PENDING", "ACCEPTED", "REJECTED"]);
export type RecordingRequestStatus = z.infer<typeof RecordingRequestStatusSchema>;

export const RecordingRequestCreatedSchema = z.object({
  requestId: z.string().uuid(),
  incidentId: z.string().uuid(),
  cameraId: z.string().uuid(),
  ownerId: z.string().uuid(),
  requesterId: z.string().uuid(),
  communityId: z.string().uuid(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  createdAt: z.string().datetime(),
});
export type RecordingRequestCreatedPayload = z.infer<typeof RecordingRequestCreatedSchema>;

export const RecordingRequestRespondedSchema = z.object({
  requestId: z.string().uuid(),
  cameraId: z.string().uuid(),
  requesterId: z.string().uuid(),
  communityId: z.string().uuid(),
  status: RecordingRequestStatusSchema,
  responseComment: z.string().nullable(),
  respondedAt: z.string().datetime(),
});
export type RecordingRequestRespondedPayload = z.infer<typeof RecordingRequestRespondedSchema>;

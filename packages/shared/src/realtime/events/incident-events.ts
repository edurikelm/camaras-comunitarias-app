import { z } from "zod";

export const AlertSeveritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;

export const IncidentTypeSchema = z.enum([
  "THEFT",
  "SUSPICIOUS_PERSON",
  "SUSPICIOUS_VEHICLE",
  "EMERGENCY",
  "ACCIDENT",
  "OTHER",
]);
export type IncidentType = z.infer<typeof IncidentTypeSchema>;

export const IncidentStatusSchema = z.enum(["OPEN", "REVIEWING", "CLOSED"]);
export type IncidentStatus = z.infer<typeof IncidentStatusSchema>;

export const AlertCreatedSchema = z.object({
  alertId: z.string().uuid(),
  communityId: z.string().uuid(),
  sectorId: z.string().uuid().nullable(),
  severity: AlertSeveritySchema,
  type: z.string(),
  message: z.string(),
  incidentId: z.string().uuid().nullable(),
  sosEventId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});
export type AlertCreatedPayload = z.infer<typeof AlertCreatedSchema>;

export const IncidentCreatedSchema = z.object({
  incidentId: z.string().uuid(),
  communityId: z.string().uuid(),
  sectorId: z.string().uuid().nullable(),
  type: IncidentTypeSchema,
  severity: AlertSeveritySchema,
  status: IncidentStatusSchema,
  description: z.string(),
  location: z.string().nullable(),
  createdById: z.string().uuid(),
  createdAt: z.string().datetime(),
});
export type IncidentCreatedPayload = z.infer<typeof IncidentCreatedSchema>;

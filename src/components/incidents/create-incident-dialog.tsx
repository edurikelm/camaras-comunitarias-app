"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SectorOption = {
  id: string;
  name: string;
};

type CreateIncidentDialogProps = {
  communityId: string;
  sectors: SectorOption[];
};

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const incidentTypes = [
  { value: "THEFT", label: "Robo" },
  { value: "SUSPICIOUS_PERSON", label: "Persona sospechosa" },
  { value: "SUSPICIOUS_VEHICLE", label: "Vehículo sospechoso" },
  { value: "EMERGENCY", label: "Emergencia" },
  { value: "ACCIDENT", label: "Accidente" },
  { value: "OTHER", label: "Otro" },
] as const;

const createIncidentSchema = z.object({
  type: z.string().min(1, "Selecciona un tipo de incidente"),
  description: z.string().min(1, "La descripción es requerida"),
  location: z.string().optional().or(z.literal("")),
  sectorId: z.string().optional().or(z.literal("")),
});

type CreateIncidentFormValues = z.infer<typeof createIncidentSchema>;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateIncidentDialog({
  communityId,
  sectors,
}: CreateIncidentDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitState, setSubmitState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "success"; message: string }
    | { status: "error"; message: string }
  >({ status: "idle" });

  const abortControllerRef = useRef<AbortController | null>(null);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const form = useForm<CreateIncidentFormValues>({
    resolver: zodResolver(createIncidentSchema),
    defaultValues: {
      type: "",
      description: "",
      location: "",
      sectorId: "",
    },
  });

  const isBusy =
    submitState.status === "loading" || submitState.status === "success";

  const resetFormAndState = useCallback(() => {
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = null;
    }
    setSubmitState({ status: "idle" });
    form.reset();
  }, [form]);

  const onSubmit = useCallback(
    async (values: CreateIncidentFormValues) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setSubmitState({ status: "loading" });

      try {
        const body: Record<string, unknown> = {
          type: values.type,
          description: values.description,
        };
        if (values.location) {
          body.location = values.location;
        }
        if (values.sectorId) {
          body.sectorId = values.sectorId;
        }

        const response = await fetch(
          `/api/communities/${communityId}/incidents`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: controller.signal,
          },
        );

        if (controller.signal.aborted) {
          return;
        }

        let responseBody: { error?: string } | undefined;
        try {
          responseBody = await response.json();
        } catch {
          responseBody = undefined;
        }

        if (!response.ok) {
          setSubmitState({
            status: "error",
            message: responseBody?.error ?? "Error inesperado al crear el incidente",
          });
          return;
        }

        setSubmitState({
          status: "success",
          message: "Incidente creado exitosamente.",
        });

        successTimeoutRef.current = setTimeout(() => {
          setOpen(false);
          resetFormAndState();
          router.refresh();
        }, 1500);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        setSubmitState({
          status: "error",
          message:
            error instanceof TypeError
              ? "Error de conexión. Verifica tu red e intenta nuevamente."
              : "Error inesperado al crear el incidente",
        });
      }
    },
    [communityId, resetFormAndState, router],
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (!nextOpen) {
        abortControllerRef.current?.abort();
        resetFormAndState();
      }
    },
    [resetFormAndState],
  );

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon data-icon="inline-start" />
          Crear incidente
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reportar incidente</DialogTitle>
          <DialogDescription>
            Reporta un evento relevante para la seguridad comunitaria. La
            severidad se sugerirá automaticamente segun el tipo de incidente.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          {/* eslint-disable-next-line react-hooks/refs -- form.handleSubmit only invokes the callback in event handlers */}
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-6"
          >
            <fieldset disabled={isBusy} className="flex flex-col gap-6">
              {/* Type */}
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de incidente *</FormLabel>
                    <FormControl>
                      <select
                        {...field}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                      >
                        <option value="" disabled>
                          Selecciona un tipo
                        </option>
                        {incidentTypes.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Description */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción *</FormLabel>
                    <FormControl>
                      <textarea
                        {...field}
                        placeholder="Describe el incidente..."
                        rows={3}
                        className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Location */}
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ubicación</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ej: Esquina de Av. Principal con Calle 2 (opcional)"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Sector */}
              {sectors.length > 0 && (
                <FormField
                  control={form.control}
                  name="sectorId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sector comunitario</FormLabel>
                      <FormControl>
                        <select
                          {...field}
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                        >
                          <option value="">Sin sector (opcional)</option>
                          {sectors.map((sector) => (
                            <option key={sector.id} value={sector.id}>
                              {sector.name}
                            </option>
                          ))}
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </fieldset>

            {/* Submit feedback */}
            {submitState.status === "error" ? (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{submitState.message}</AlertDescription>
              </Alert>
            ) : submitState.status === "success" ? (
              <Alert variant="default">
                <AlertTitle>Incidente creado</AlertTitle>
                <AlertDescription>{submitState.message}</AlertDescription>
              </Alert>
            ) : null}

            {/* Submit button */}
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={isBusy}
                onClick={() => handleOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isBusy}>
                {submitState.status === "loading" ? (
                  <>
                    <Loader2Icon
                      data-icon="inline-start"
                      className="animate-spin"
                    />
                    Creando...
                  </>
                ) : (
                  "Reportar incidente"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

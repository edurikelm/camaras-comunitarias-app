"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CameraIcon, Loader2Icon, PlusIcon } from "lucide-react";
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

type RegisterCameraDialogProps = {
  communityId: string;
  sectors: SectorOption[];
};

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const registerCameraSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "El nombre de la camara es requerido")
    .max(100, "El nombre debe tener maximo 100 caracteres"),
  description: z
    .string()
    .trim()
    .max(500, "La descripcion debe tener maximo 500 caracteres")
    .optional()
    .or(z.literal("")),
  approximateLocation: z
    .string()
    .trim()
    .max(200, "La ubicacion debe tener maximo 200 caracteres")
    .optional()
    .or(z.literal("")),
  sectorId: z
    .string()
    .uuid("Selecciona un sector valido")
    .optional()
    .or(z.literal("")),
  rtspUrl: z
    .string()
    .trim()
    .regex(
      /^rtsp:\/\/[^\s\/]+(\/[^\s]*)?(\?[^\s]*)?$/i,
      "La URL debe comenzar con rtsp:// y tener formato valido",
    ),
  streamKey: z
    .string()
    .min(8, "El stream key debe tener al menos 8 caracteres")
    .optional()
    .or(z.literal("")),
});

type RegisterCameraFormValues = z.infer<typeof registerCameraSchema>;

// ---------------------------------------------------------------------------
// Error map: backend error messages -> UI messages (es)
// ---------------------------------------------------------------------------

const ERROR_MAP: Record<string, string> = {
  "Camera name is required": "El nombre de la camara es requerido.",
  "A valid RTSP URL starting with rtsp:// is required":
    "La URL RTSP debe comenzar con rtsp:// y tener formato valido.",
  "Sector does not belong to this community":
    "El sector seleccionado no pertenece a tu comunidad.",
  "Only an ACTIVE NEIGHBOR, GUARD, or ADMIN can register a camera":
    "Tu membresia no permite registrar camaras. Solo vecinos, guardias o administradores activos pueden hacerlo.",
  "Community not found":
    "La comunidad no existe o ya no esta disponible.",
  "Stream key must be at least 8 characters":
    "El stream key debe tener al menos 8 caracteres.",
};

function mapBackendError(raw: string): string {
  if (ERROR_MAP[raw]) return ERROR_MAP[raw];
  return "Error inesperado al registrar la camara. Intentá de nuevo.";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RegisterCameraDialog({
  communityId,
  sectors,
}: RegisterCameraDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitState, setSubmitState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "success"; cameraName: string }
    | { status: "error"; message: string }
  >({ status: "idle" });

  const abortControllerRef = useRef<AbortController | null>(null);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const form = useForm<RegisterCameraFormValues>({
    resolver: zodResolver(registerCameraSchema),
    defaultValues: {
      name: "",
      description: "",
      approximateLocation: "",
      sectorId: "",
      rtspUrl: "",
      streamKey: "",
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
    async (values: RegisterCameraFormValues) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setSubmitState({ status: "loading" });

      try {
        const body: Record<string, unknown> = {
          name: values.name,
          rtspUrl: values.rtspUrl,
        };

        if (values.description) {
          body.description = values.description;
        }
        if (values.approximateLocation) {
          body.approximateLocation = values.approximateLocation;
        }
        if (values.sectorId) {
          body.sectorId = values.sectorId;
        }
        if (values.streamKey) {
          body.streamKey = values.streamKey;
        }

        const response = await fetch(
          `/api/communities/${communityId}/cameras`,
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

        let responseBody: { error?: string; data?: { camera?: { name?: string } } } | undefined;
        try {
          responseBody = await response.json();
        } catch {
          responseBody = undefined;
        }

        if (!response.ok) {
          const rawError =
            responseBody?.error ?? "Error inesperado al registrar la camara";
          setSubmitState({
            status: "error",
            message: mapBackendError(rawError),
          });
          return;
        }

        const cameraName =
          responseBody?.data?.camera?.name ?? values.name;
        setSubmitState({
          status: "success",
          cameraName,
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
              ? "Error de conexion. Verifica tu red e intenta nuevamente."
              : "Error inesperado al registrar la camara. Intentá de nuevo.",
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
          Registrar camara
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar camara</DialogTitle>
          <DialogDescription>
            Ingresá la URL RTSP de tu camara IP o DVR. La camara quedara en
            revision hasta que un administrador la active. La URL y el stream
            key nunca se exponen a otros miembros.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          {/* eslint-disable-next-line react-hooks/refs -- form.handleSubmit only invokes the callback in event handlers */}
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-6"
          >
            <fieldset disabled={isBusy} className="flex flex-col gap-6">
              {/* Name */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre de la camara *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ej: Entrada principal, Patio trasero"
                        {...field}
                      />
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
                    <FormLabel>Descripcion</FormLabel>
                    <FormControl>
                      <textarea
                        {...field}
                        placeholder="Describe la camara (opcional)"
                        rows={2}
                        className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Approximate location */}
              <FormField
                control={form.control}
                name="approximateLocation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ubicacion aproximada</FormLabel>
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

              {/* RTSP URL */}
              <FormField
                control={form.control}
                name="rtspUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>URL RTSP *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="rtsp://192.168.1.100:554/stream"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Stream Key */}
              <FormField
                control={form.control}
                name="streamKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stream key</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="off"
                        placeholder="Clave de acceso al stream (opcional, min 8 caracteres)"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </fieldset>

            {/* Submit feedback */}
            {submitState.status === "error" ? (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{submitState.message}</AlertDescription>
              </Alert>
            ) : submitState.status === "success" ? (
              <Alert variant="default">
                <AlertTitle>Camara registrada</AlertTitle>
                <AlertDescription>
                  Camara &quot;{submitState.cameraName}&quot; registrada en
                  revision. Un administrador la aprobara para que sea visible.
                </AlertDescription>
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
                    Registrando...
                  </>
                ) : (
                  <>
                    <CameraIcon data-icon="inline-start" />
                    Registrar camara
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

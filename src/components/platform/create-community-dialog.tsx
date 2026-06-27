"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
// Schema
// ---------------------------------------------------------------------------

const createCommunitySchema = z.object({
  community: z.object({
    name: z.string().min(1, "El nombre de la comunidad es requerido"),
    address: z.string().optional().or(z.literal("")),
  }),
  firstAdmin: z.object({
    authProviderId: z
      .string()
      .uuid("Debe ser un UUID válido (ej: 11111111-1111-1111-1111-111111111111)"),
    email: z.string().email("Debe ser un email válido"),
    name: z.string().optional().or(z.literal("")),
  }),
});

type CreateCommunityFormValues = z.infer<typeof createCommunitySchema>;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateCommunityDialog() {
  const [open, setOpen] = useState(false);
  const [submitState, setSubmitState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "success"; message: string }
    | { status: "error"; message: string }
  >({ status: "idle" });

  const abortControllerRef = useRef<AbortController | null>(null);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const form = useForm<CreateCommunityFormValues>({
    resolver: zodResolver(createCommunitySchema),
    defaultValues: {
      community: { name: "", address: "" },
      firstAdmin: { authProviderId: "", email: "", name: "" },
    },
  });

  const isBusy = submitState.status === "loading" || submitState.status === "success";

  const resetFormAndState = useCallback(() => {
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = null;
    }
    setSubmitState({ status: "idle" });
    form.reset();
  }, [form]);

  const onSubmit = useCallback(
    async (values: CreateCommunityFormValues) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setSubmitState({ status: "loading" });

      try {
        const response = await fetch("/api/platform/communities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            community: {
              name: values.community.name,
              ...(values.community.address ? { address: values.community.address } : {}),
            },
            firstAdmin: {
              authProviderId: values.firstAdmin.authProviderId,
              email: values.firstAdmin.email,
              ...(values.firstAdmin.name ? { name: values.firstAdmin.name } : {}),
            },
          }),
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          return;
        }

        let body: { error?: string; data?: { community?: { name?: string } } } | undefined;
        try {
          body = await response.json();
        } catch {
          body = undefined;
        }

        if (!response.ok) {
          setSubmitState({
            status: "error",
            message: body?.error ?? "Error inesperado al crear la comunidad",
          });
          return;
        }

        setSubmitState({
          status: "success",
          message: `Comunidad "${body?.data?.community?.name ?? values.community.name}" creada exitosamente.`,
        });

        successTimeoutRef.current = setTimeout(() => {
          setOpen(false);
          resetFormAndState();
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
              : "Error inesperado al crear la comunidad",
        });
      }
    },
    [resetFormAndState],
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
          Crear comunidad
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Crear nueva comunidad</DialogTitle>
          <DialogDescription>
            Registra una nueva comunidad y asigna su primer administrador. Ambos quedan activos
            inmediatamente.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          {/* eslint-disable-next-line react-hooks/refs -- form.handleSubmit only invokes the callback in event handlers, it does not read refs during render */}
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
            <fieldset disabled={isBusy} className="flex flex-col gap-6">
              {/* Community fields */}
              <fieldset className="flex flex-col gap-4">
                <legend className="text-sm font-medium text-muted-foreground">
                  Datos de la comunidad
                </legend>

                <FormField
                  control={form.control}
                  name="community.name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre de la comunidad *</FormLabel>
                      <FormControl>
                        <Input placeholder="Ej: Barrio Norte" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="community.address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dirección</FormLabel>
                      <FormControl>
                        <Input placeholder="Ej: Av. Principal 123 (opcional)" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </fieldset>

              {/* First admin fields */}
              <fieldset className="flex flex-col gap-4">
                <legend className="text-sm font-medium text-muted-foreground">
                  Primer administrador
                </legend>

                <FormField
                  control={form.control}
                  name="firstAdmin.authProviderId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Auth Provider ID (UUID) *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="11111111-1111-1111-1111-111111111111"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="firstAdmin.email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email *</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="admin@comunidad.cl" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="firstAdmin.name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre</FormLabel>
                      <FormControl>
                        <Input placeholder="Ej: Admin Uno (opcional)" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </fieldset>
            </fieldset>

            {/* Submit feedback */}
            {submitState.status === "error" ? (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{submitState.message}</AlertDescription>
              </Alert>
            ) : submitState.status === "success" ? (
              <Alert variant="default">
                <AlertTitle>Comunidad creada</AlertTitle>
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
                    <Loader2Icon data-icon="inline-start" className="animate-spin" />
                    Creando...
                  </>
                ) : (
                  "Crear comunidad"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

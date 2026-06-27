import { ShieldAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type NoPermissionStateProps = {
  title?: string;
  description?: string;
};

export function NoPermissionState({
  title = "Sin permisos para esta informacion",
  description = "Tu membresia, rol, horario permitido y permisos explicitos deben validarse antes de mostrar datos sensibles.",
}: NoPermissionStateProps) {
  return (
    <Alert variant="destructive">
      <ShieldAlertIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  );
}

import type { ReactNode } from "react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

type DomainEmptyStateProps = {
  icon: ReactNode;
  title: string;
  description: string;
  /**
   * Optional non-interactive label for what action will eventually be
   * available here.  Rendered as muted text under the description; never as
   * a disabled button (those create the illusion of broken functionality).
   */
  action?: string;
};

export function DomainEmptyState({
  icon,
  title,
  description,
  action,
}: DomainEmptyStateProps) {
  return (
    <Empty className="border bg-card">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action ? (
        <p className="px-6 pb-6 text-xs text-muted-foreground">
          Proximamente: {action}
        </p>
      ) : null}
    </Empty>
  );
}

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

type DomainEmptyStateProps = {
  icon: ReactNode;
  title: string;
  description: string;
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
        <EmptyContent>
          <Button variant="outline" disabled>
            Proximamente: {action}
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}

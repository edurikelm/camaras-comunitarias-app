import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { LogoutButton } from "@/components/domain/logout-button";
import { cn } from "@/lib/utils";

const navigationItems = [
  { href: "/", label: "Inicio" },
  { href: "/platform", label: "Plataforma" },
  { href: "/dashboard", label: "Comunidad" },
  { href: "/cameras", label: "Camaras" },
  { href: "/incidents", label: "Incidentes" },
];

type RouteShellProps = {
  badge: string;
  title: string;
  description: string;
  activeHref: string;
  children: ReactNode;
  action?: ReactNode;
};

export function RouteShell({
  badge,
  title,
  description,
  activeHref,
  children,
  action,
}: RouteShellProps) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-6 py-6 lg:px-8">
        <header className="flex flex-col gap-5 rounded-2xl border bg-card p-5 text-card-foreground shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex max-w-3xl flex-col gap-3">
              <Badge variant="secondary" className="w-fit">
                {badge}
              </Badge>
              <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">
                  {title}
                </h1>
                <p className="text-base leading-7 text-muted-foreground sm:text-lg">
                  {description}
                </p>
              </div>
            </div>
            {action ? <div className="flex shrink-0 flex-col gap-2 sm:flex-row">{action}</div> : null}
          </div>

          <Separator />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <nav aria-label="Secciones principales" className="flex flex-wrap gap-2">
              {navigationItems.map((item) => (
                <Button
                  key={item.href}
                  asChild
                  variant={item.href === activeHref ? "default" : "ghost"}
                  size="sm"
                  className={cn(item.href === activeHref && "pointer-events-none")}
                >
                  <Link href={item.href} aria-current={item.href === activeHref ? "page" : undefined}>
                    {item.label}
                  </Link>
                </Button>
              ))}
            </nav>
            <LogoutButton />
          </div>
        </header>

        {children}
      </div>
    </main>
  );
}

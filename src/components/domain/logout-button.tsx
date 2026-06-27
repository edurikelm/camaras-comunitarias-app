"use client";

import { useRouter } from "next/navigation";
import { LogOutIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSupabase } from "@/components/providers/supabase-provider";

export function LogoutButton() {
  const supabase = useSupabase();
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleLogout}>
      <LogOutIcon data-icon="inline-start" />
      Cerrar sesión
    </Button>
  );
}

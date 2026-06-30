import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SupabaseProvider } from "@/components/providers/supabase-provider";
import { RealtimeProvider } from "@/components/providers/realtime-provider";
import { Toaster } from "@/components/ui/sonner";
import { RealtimeToaster } from "@/components/realtime/realtime-toaster";
import { RealtimeRefresh } from "@/components/realtime/realtime-refresh";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Camaras Comunitarias",
  description: "Red privada de seguridad comunitaria para comunidades residenciales.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        {/* Skip link WCAG 2.4.1 — primer elemento focusable del documento */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Saltar al contenido principal
        </a>
        <SupabaseProvider>
          <RealtimeProvider>
            <RealtimeToaster />
            <RealtimeRefresh />
            {children}
          </RealtimeProvider>
        </SupabaseProvider>
        <Toaster />
      </body>
    </html>
  );
}

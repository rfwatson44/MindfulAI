"use client";
import { Sidebar } from "@/components/layout/sidebar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export default function ProvidersLayout({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 lg:ml-72">
          <main>{children}</main>
        </div>
      </div>
    </QueryClientProvider>
  );
}

"use client";
import { forwardRef, ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="flex min-h-screen">
      <Sidebar className="hidden lg:block" />
      <div className="flex-1 lg:ml-72">
        <main>{children}</main>
      </div>
    </div>
  );
}

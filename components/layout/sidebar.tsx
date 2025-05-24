"use client";

import React, { useState, forwardRef, Fragment as ReactFragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart2,
  Home,
  Menu,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

import { useEffect } from "react";
import { supabase } from "@/utils/supabase/client";

interface Account {
  account_id: string;
  account_name: string;
}

type SidebarProps = {
  className?: string;
};

export const Sidebar = forwardRef<HTMLDivElement, SidebarProps>(
  ({ className }, ref) => {
    const pathname = usePathname();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [accounts, setAccounts] = useState<Account[]>([]);

    console.log("[Sidebar] Rendered. Pathname:", pathname);

    useEffect(() => {
      async function fetchAccounts() {
        const { data, error } = await supabase
          .from("accounts")
          .select("account_id, account_name");
        if (!error && data) setAccounts(data);
      }
      fetchAccounts();
    }, []);

    useEffect(() => {
      setIsSidebarOpen(false);
      console.log("[Sidebar] Pathname changed:", pathname);
    }, [pathname]);

    return (
      <>
        {/* Mobile sidebar trigger */}
        <Button
          variant="outline"
          size="icon"
          className="fixed left-4 top-4 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Sidebar */}
        <aside
          key={pathname}
          ref={ref}
          className={cn(
            "fixed z-50 inset-y-0 left-0 w-72 flex flex-col border-r border-border bg-background transition-transform duration-300",
            isSidebarOpen
              ? "translate-x-0"
              : "-translate-x-full lg:translate-x-0",
            className
          )}
          aria-label="Sidebar"
        >
          <div className="flex h-full flex-col">
            <div className="flex h-16 items-center justify-between px-6">
              <div className="flex items-center gap-2 text-lg font-bold px-0 py-0 h-auto">
                <BarChart2 className="h-6 w-6 mr-2" /> MindfulAI
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setIsSidebarOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <ScrollArea className="flex-1 py-4">
              <nav className="grid gap-1 px-2">
                <Button
                  asChild
                  variant={pathname === "/dashboard" ? "secondary" : "ghost"}
                  className="w-full justify-start"
                >
                  <Link href="/dashboard">
                    <Home className="mr-2 h-4 w-4" /> Dashboard
                  </Link>
                </Button>

                <div className="mt-6 px-4">
                  <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                    Ad Accounts
                  </h4>
                  {accounts.map((account) => (
                    <React.Fragment key={account.account_id}>
                      <Button
                        asChild
                        variant={
                          pathname === `/account/${account.account_id}`
                            ? "secondary"
                            : "ghost"
                        }
                        className="w-full justify-start"
                      >
                        <Link href={`/account/${account.account_id}`}>
                          {account.account_name}
                        </Link>
                      </Button>
                    </React.Fragment>
                  ))}
                </div>

                <div className="mt-6 px-4">
                  <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                    Settings
                  </h4>
                  <Button
                    asChild
                    variant={pathname === "/admin" ? "secondary" : "ghost"}
                    className="w-full justify-start"
                  >
                    <Link href="/admin">
                      <ShieldCheck className="mr-2 h-4 w-4" /> Admin
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant={pathname === "/settings" ? "secondary" : "ghost"}
                    className="w-full justify-start"
                  >
                    <Link href="/settings">
                      <Settings className="mr-2 h-4 w-4" /> Settings
                    </Link>
                  </Button>
                </div>
              </nav>
            </ScrollArea>

            <div className="border-t border-border p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary">
                  <Users className="h-4 w-4 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">John Doe</p>
                  <p className="text-xs text-muted-foreground">Admin</p>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </>
    );
  }
);

Sidebar.displayName = "Sidebar";

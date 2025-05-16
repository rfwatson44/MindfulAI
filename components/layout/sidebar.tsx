"use client";

import { useState } from "react";
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

// Mock data for ad accounts
const adAccounts = [
  { id: "123", name: "Main Marketing Account" },
  { id: "456", name: "Product Launch Campaign" },
  { id: "789", name: "Brand Awareness" },
];

type SidebarProps = {
  className?: string;
};

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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

      {/* Backdrop for mobile */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 border-r border-border bg-background transition-transform lg:relative lg:z-0 lg:translate-x-0",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full",
          className
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center justify-between px-6">
            <Link href="/dashboard" className="flex items-center gap-2">
              <BarChart2 className="h-6 w-6 text-primary" />
              <span className="text-lg font-bold">MindfulAI</span>
            </Link>
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
              <Link href="/dashboard">
                <Button
                  variant={pathname === "/dashboard" ? "secondary" : "ghost"}
                  className="w-full justify-start"
                >
                  <Home className="mr-2 h-4 w-4" /> Dashboard
                </Button>
              </Link>
              
              <div className="mt-6 px-4">
                <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  Ad Accounts
                </h4>
                {adAccounts.map((account) => (
                  <Link key={account.id} href={`/account/${account.id}`}>
                    <Button
                      variant={
                        pathname === `/account/${account.id}` ? "secondary" : "ghost"
                      }
                      className="w-full justify-start truncate text-sm"
                    >
                      {account.name}
                    </Button>
                  </Link>
                ))}
              </div>
              
              <div className="mt-6 px-4">
                <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  Settings
                </h4>
                <Link href="/admin">
                  <Button
                    variant={pathname === "/admin" ? "secondary" : "ghost"}
                    className="w-full justify-start"
                  >
                    <ShieldCheck className="mr-2 h-4 w-4" /> Admin
                  </Button>
                </Link>
                <Link href="/settings">
                  <Button
                    variant={pathname === "/settings" ? "secondary" : "ghost"}
                    className="w-full justify-start"
                  >
                    <Settings className="mr-2 h-4 w-4" /> Settings
                  </Button>
                </Link>
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
      </div>
    </>
  );
}
"use client";

import { useState } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UsersTab } from "@/components/admin/users-tab";
import { AccountsTab } from "@/components/admin/accounts-tab";
import { mockUsers, mockAdAccounts } from "@/lib/mock-data";

export default function AdminPage() {
  const [users, setUsers] = useState(mockUsers);
  const [accounts, setAccounts] = useState(mockAdAccounts);

  return (
    <DashboardLayout>
      <div className="p-6 md:p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
          <p className="text-muted-foreground">
            Manage users and ad accounts
          </p>
        </div>

        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="accounts">Ad Accounts</TabsTrigger>
          </TabsList>
          
          <div className="mt-4">
            <TabsContent value="users">
              <UsersTab users={users} setUsers={setUsers} />
            </TabsContent>
            
            <TabsContent value="accounts">
              <AccountsTab accounts={accounts} setAccounts={setAccounts} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
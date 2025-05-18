"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { 
  MoreHorizontal, 
  PlusCircle, 
  Search,
  Trash2,
  ExternalLink,
  Users,
  RefreshCw
} from "lucide-react";
import { AdAccount } from "@/lib/types";

interface AccountsTabProps {
  accounts: AdAccount[];
  setAccounts: React.Dispatch<React.SetStateAction<AdAccount[]>>;
}

export function AccountsTab({ accounts, setAccounts }: AccountsTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [newAccount, setNewAccount] = useState<Partial<AdAccount>>({
    name: "",
    status: "active",
  });

  // Filter accounts based on search query
  const filteredAccounts = accounts.filter((account) =>
    account.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    account.id.includes(searchQuery)
  );

  // Handle add account
  const handleAddAccount = () => {
    if (!newAccount.name) return;
    
    const account: AdAccount = {
      id: `acc-${Date.now()}`,
      name: newAccount.name,
      status: "active",
      metrics: {
        spend: 0,
        conversions: 0,
        adCount: 0,
        cpa: 0,
      },
    };
    
    setAccounts([...accounts, account]);
    setNewAccount({
      name: "",
      status: "active",
    });
    setIsAddAccountOpen(false);
  };

  // Handle refresh account
  const handleRefreshAccount = (accountId: string) => {
    // In a real app, this would trigger an API call to refresh account data
    console.log(`Refreshing account ${accountId}`);
  };

  // Handle delete account
  const handleDeleteAccount = (accountId: string) => {
    setAccounts(accounts.filter((account) => account.id !== accountId));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input 
            placeholder="Search accounts..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <Dialog open={isAddAccountOpen} onOpenChange={setIsAddAccountOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Account
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Ad Account</DialogTitle>
              <DialogDescription>
                Connect a new Facebook Ad Account to MindfulAI.
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Account Name</Label>
                <Input
                  id="name"
                  value={newAccount.name}
                  onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                  placeholder="Enter account name"
                />
              </div>
              
              <div className="rounded-lg border p-4">
                <h4 className="mb-2 text-sm font-medium">Connect with Facebook</h4>
                <p className="text-sm text-muted-foreground">
                  In a real implementation, this would include Facebook OAuth integration 
                  to connect and retrieve your ad accounts.
                </p>
                <Button className="mt-4" variant="outline" disabled>
                  <svg className="mr-2 h-4 w-4 text-[#1877F2]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                  Connect with Facebook
                </Button>
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddAccountOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddAccount}>Add Account</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[250px]">Account Name</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Spend</TableHead>
              <TableHead>Ads</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAccounts.length > 0 ? (
              filteredAccounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">{account.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {account.id}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={account.status === "active" ? "default" : "secondary"}
                      className="capitalize"
                    >
                      {account.status}
                    </Badge>
                  </TableCell>
                  <TableCell>${account.metrics.spend.toLocaleString()}</TableCell>
                  <TableCell>{account.metrics.adCount}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          className="h-8 w-8 p-0"
                        >
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleRefreshAccount(account.id)}
                        >
                          <RefreshCw className="mr-2 h-4 w-4" />
                          <span>Refresh Data</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <a href={`/account/${account.id}`}>
                            <ExternalLink className="mr-2 h-4 w-4" />
                            <span>View Account</span>
                          </a>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Users className="mr-2 h-4 w-4" />
                          <span>Manage Access</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDeleteAccount(account.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          <span>Delete Account</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No accounts found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
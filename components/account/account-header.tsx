import { Button } from "@/components/ui/button";
import { RefreshCw, Share2 } from "lucide-react";
import { DateRangePicker } from "@/components/account/date-range-picker";
import { AdAccount } from "@/lib/types";

interface AccountHeaderProps {
  account: AdAccount;
}

export function AccountHeader({ account }: AccountHeaderProps) {
  return (
    <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{account.name}</h1>
        <p className="text-muted-foreground">ID: {account.id}</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <DateRangePicker />
        <div className="flex space-x-2">
          <Button variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon">
            <Share2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
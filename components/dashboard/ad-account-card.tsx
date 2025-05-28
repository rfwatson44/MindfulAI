import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { AdAccount } from "@/lib/types";
import { ExternalLink } from "lucide-react";

interface AdAccountCardProps {
  account: AdAccount;
}

export function AdAccountCard({ account }: AdAccountCardProps) {
  return (
    <Card className="overflow-hidden transition-all hover:shadow-md">
      <CardHeader className="bg-muted/50 p-4">
        <div className="flex items-center justify-between">
          <div className="font-semibold">{account.name}</div>
          <div className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
            {account.status || '-'}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-muted-foreground">Spend</div>
            <div className="font-semibold">{account.metrics.spend != null ? `$${account.metrics.spend.toLocaleString()}` : '-'}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Conversions</div>
            <div className="font-semibold">{account.metrics.conversions != null ? account.metrics.conversions.toLocaleString() : '-'}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Ads</div>
            <div className="font-semibold">{account.metrics.adCount != null ? account.metrics.adCount : '-'}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">CPA</div>
            <div className="font-semibold">{account.metrics.cpa != null ? `$${account.metrics.cpa.toFixed(2)}` : '-'}</div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="border-t bg-muted/20 p-4">
        <Link href={`/account/${account.id}`} className="w-full">
          <Button variant="outline" className="w-full justify-between">
            View ads
            <ExternalLink className="h-4 w-4" />
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}
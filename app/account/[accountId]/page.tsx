import { getAccountById, mockAdAccounts, filterAccountAds } from "@/lib/mock-data";
import { AccountPageClient } from "./account-page-client";
import { AdType } from "@/lib/types";

// Generate static params for all account IDs
export function generateStaticParams() {
  return mockAdAccounts.map((account) => ({
    accountId: account.id,
  }));
}

export default function AccountPage({ params }: { params: { accountId: string } }) {
  const account = getAccountById(params.accountId);

  if (!account) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Account not found</h1>
          <p className="text-muted-foreground">
            The account you are looking for doesn&apos;t exist or you don&apos;t have access to it.
          </p>
        </div>
      </div>
    );
  }

  // Pre-fetch initial ads data on the server
  const initialAdsData = filterAccountAds(account.id, "static" as AdType);

  return <AccountPageClient account={account} initialAdsData={initialAdsData} />;
}
import { redirect } from "next/navigation";
import { mockAdAccounts } from "@/lib/mock-data";

export default function Home() {
  if (mockAdAccounts.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">No Accounts Available</h1>
          <p className="text-gray-600">Please create an ad account to get started.</p>
        </div>
      </div>
    );
  }

  // Only redirect if we have at least one account
  redirect(`/account/${mockAdAccounts[0].id}`);
}
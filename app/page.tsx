import { redirect } from "next/navigation";
import { mockAdAccounts } from "@/lib/mock-data";

export default function Home() {
  // Redirect to the first account's page
  const firstAccount = mockAdAccounts[0];
  redirect(`/account/${firstAccount.id}`);
}
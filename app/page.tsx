import { redirect } from "next/navigation";
import { mockAdAccounts } from "@/lib/mock-data";

export default function Home() {
  // Redirect to the dashboard page
  redirect('/dashboard');
}

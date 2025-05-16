import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Navigation */}
      <header className="border-b border-border">
        <div className="max-w-7xl mx-auto w-full flex h-16 items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold">MindfulAI</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/auth/signin">
              <Button variant="ghost" size="sm">
                Sign In
              </Button>
            </Link>
            <Link href="/auth/signup">
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero section */}
      <section className="max-w-7xl mx-auto w-full flex flex-1 flex-col items-center justify-center px-4 py-24 text-center md:px-8 md:py-32">
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
          Analyze Facebook Ads with{" "}
          <span className="bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
            AI-powered insights
          </span>
        </h1>
        <p className="mt-6 max-w-prose text-lg text-muted-foreground md:text-xl">
          MindfulAI helps you understand your ad performance with spreadsheet-like analysis
          enhanced by artificial intelligence.
        </p>
        <div className="mt-10 flex flex-col gap-4 sm:flex-row">
          <Link href="/auth/signup">
            <Button size="lg" className="gap-2">
              Start for free
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/auth/signin">
            <Button size="lg" variant="outline">
              Sign in to dashboard
            </Button>
          </Link>
        </div>
      </section>

      {/* Features grid */}
      <section className="border-t border-border bg-muted/40">
        <div className="max-w-7xl mx-auto w-full px-4 py-24 md:px-8">
          <h2 className="text-center text-3xl font-bold md:text-4xl">
            Powerful analytics made simple
          </h2>
          <div className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => (
              <div
                key={index}
                className="rounded-lg border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  {feature.icon}
                </div>
                <h3 className="mt-4 text-xl font-medium">{feature.title}</h3>
                <p className="mt-2 text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/20 py-10">
        <div className="max-w-7xl mx-auto w-full px-4 md:px-8">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">MindfulAI</span>
              <span className="text-sm text-muted-foreground">© 2025</span>
            </div>
            <div className="flex gap-8">
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground">
                Privacy
              </a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground">
                Terms
              </a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground">
                Contact
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Feature list with icons
const features = [
  {
    title: "Spreadsheet-like Analysis",
    description:
      "Analyze your Facebook ad data with familiar spreadsheet interactions and powerful filtering.",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
        <line x1="3" x2="21" y1="9" y2="9" />
        <line x1="3" x2="21" y1="15" y2="15" />
        <line x1="9" x2="9" y1="3" y2="21" />
        <line x1="15" x2="15" y1="3" y2="21" />
      </svg>
    ),
  },
  {
    title: "AI-Powered Insights",
    description:
      "Get instant AI analysis on selected data points to uncover trends and opportunities.",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
        <path d="M3 15h14a2 2 0 1 1 0 4H3v-4Z" />
        <path d="M21 12a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v4h16v-4Z" />
      </svg>
    ),
  },
  {
    title: "Interactive Filtering",
    description:
      "Filter ads by multiple criteria including spend, performance, campaign, and more.",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
      </svg>
    ),
  },
  {
    title: "Dynamic Metrics",
    description:
      "Add or remove metric columns on-the-fly to focus on the KPIs that matter to you.",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M3 9h18" />
        <path d="M9 21V9" />
      </svg>
    ),
  },
  {
    title: "Multi-Account Management",
    description:
      "Manage and analyze multiple Facebook ad accounts from a single dashboard.",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect width="8" height="8" x="2" y="2" rx="2" />
        <rect width="8" height="8" x="14" y="2" rx="2" />
        <rect width="8" height="8" x="2" y="14" rx="2" />
        <rect width="8" height="8" x="14" y="14" rx="2" />
      </svg>
    ),
  },
  {
    title: "Role-Based Access",
    description:
      "Control who sees what with granular permission settings for admins and users.",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
];
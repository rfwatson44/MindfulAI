import "./globals.css";
import type { Metadata } from "next";
import ProvidersLayout from "./providers";

export const metadata: Metadata = {
  title: "MindfulAI",
  description: "AI-powered ad management platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* DNS prefetch for better performance */}
        <link rel="dns-prefetch" href="//fonts.googleapis.com" />
        <link rel="dns-prefetch" href="//fonts.gstatic.com" />
        {/* Preconnect to Google Fonts for better performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* Load Inter font with display=swap for better performance */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans">
        <ProvidersLayout>{children}</ProvidersLayout>
      </body>
    </html>
  );
}

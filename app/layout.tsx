import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import ProvidersLayout from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MindfulAI",
  description: "AI-powered ad management platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ProvidersLayout>{children}</ProvidersLayout>
      </body>
    </html>
  );
}


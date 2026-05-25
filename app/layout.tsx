import type { Metadata } from "next";
import "./globals.css";
import "streamdown/styles.css";
import { Outfit, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme-provider";

// Outfit — clean geometric grotesk matching the Procora brand
const outfit = Outfit({ subsets: ['latin'], variable: '--font-sans', weight: ['400','500','600','700'] });
const instrumentSerif = Instrument_Serif({ subsets: ['latin'], weight: '400', variable: '--font-instrument-serif' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', weight: ['400','500'] });

export const metadata: Metadata = {
  title: "Procora",
  description: "Procurement workflow — AI sourcing, RFQs, audit trail.",
  icons: {
    apple: "/procora-logo.png",
    icon: "/procora-logo.png",
    shortcut: "/procora-logo.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={cn("font-sans", outfit.variable, instrumentSerif.variable, jetbrainsMono.variable)}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

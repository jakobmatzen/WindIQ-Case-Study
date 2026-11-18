import type { Metadata } from "next";
import { JetBrains_Mono, Onest, Space_Grotesk } from "next/font/google";
import "./globals.css";

// WindIQ's typefaces (windiq.de): Onest for text, Space Grotesk for headings and figures,
// JetBrains Mono for formulas.
const onest = Onest({ variable: "--font-onest", subsets: ["latin"] });
const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "WindIQ Ertragsrechnung",
  description: "Live-Ertragsrechnung aus Messmastdaten: AEP, P50 und P90",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="de"
      className={`${onest.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const display = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"] });
const body = DM_Sans({ variable: "--font-body", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Squiggle — custom 3D design & printing in Houston", template: "%s · Squiggle" },
  description:
    "Send a photo, a sketch, a model, or just a sentence. Squiggle turns it into a 3D model with a quote, render, and turntable video in about an hour. Download the STL or have us print it in Houston, TX.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <footer className="mt-20 border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-sm text-muted">
            <p>© {new Date().getFullYear()} Squiggle · 3D printing & custom fabrication · Houston, TX</p>
            <p>Pickup, local delivery, and nationwide shipping</p>
          </div>
        </footer>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { CircuitBackdrop } from "@/components/circuit-backdrop";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const body = Space_Grotesk({ variable: "--font-body", subsets: ["latin"] });
const code = JetBrains_Mono({ variable: "--font-code", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Squiggle — custom 3D design & printing in Houston", template: "%s · Squiggle" },
  description:
    "Upload a 3D model and we print it, or send a photo, a sketch, or a sentence and we design it, with a quote in about an hour. Squiggle is a 3D print and custom fabrication shop in Houston, TX.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${code.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <CircuitBackdrop />
        <SiteHeader />
        <main className="relative z-10 flex-1">{children}</main>
        <footer className="relative z-10 mt-20 border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-sm text-muted">
            <p>© {new Date().getFullYear()} Squiggle · 3D printing & custom fabrication · Houston, TX</p>
            <p>Pickup, local delivery, and nationwide shipping</p>
          </div>
        </footer>
      </body>
    </html>
  );
}

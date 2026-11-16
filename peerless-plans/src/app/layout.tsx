import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const sans = IBM_Plex_Sans({ variable: "--font-sans", subsets: ["latin"], weight: ["400", "600", "700"] });
const mono = IBM_Plex_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: { default: "Peerless Plans | Lease-ready drawings by tomorrow", template: "%s | Peerless Plans" },
  description:
    "Houston's AI-native plan studio. Test fits and lease exhibits for commercial real estate in 24 to 48 hours, at flat public prices, with a named person checking every sheet.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <header className="top">
          <div className="wrap">
            <Link className="brand" href="/"><i />PEERLESS PLANS</Link>
            <nav className="nav" aria-label="Main">
              <Link href="/#how">How it works</Link>
              <Link href="/#prices">Prices</Link>
              <Link href="/#qa">AI and QA</Link>
              <Link href="/#owners">Owners and brokers</Link>
              <Link className="btn small" href="/order">Order a drawing</Link>
            </nav>
          </div>
        </header>
        {children}
        <footer>
          <div className="wrap">
            <div>
              <p><Link className="brand" href="/"><i />PEERLESS PLANS</Link></p>
              <p>
                Peerless Plans is a drafting studio in Houston, Texas. We are not an architecture, engineering, or surveying firm. Test fits are
                conceptual space plans for discussion only and are not for construction or permit. Areas are calculated from drawings provided
                and are not field verified unless a field check is ordered.
              </p>
            </div>
            <div>
              <p>
                <Link href="/order">Order a drawing</Link><br />
                <Link href="/#prices">Prices</Link><br />
                <Link href="/#qa">How the AI and QA work</Link><br />
                <Link href="/#owners">Owners and brokers</Link>
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}

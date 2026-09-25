import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NavBar from "@/components/NavBar";
import { ColorConventionProvider } from "@/components/ColorConvention";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "VolumeLens — Taiwan Unusual Volume Scanner",
  description:
    "Scans ~2,300 TWSE and TPEx stocks for unusual trading volume, with end-of-day relative volume rankings and daily charts.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="flex min-h-screen flex-col bg-gray-50 font-sans text-gray-900 antialiased">
        <ColorConventionProvider>
          <NavBar />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
          <footer className="border-t border-gray-200 px-4 py-6 text-center text-xs text-gray-400">
            Data: Taiwan Stock Exchange (TWSE), Taipei Exchange (TPEx) and Fugle. Times are Taipei time (UTC+8).
            For informational purposes only; not investment advice.
          </footer>
        </ColorConventionProvider>
      </body>
    </html>
  );
}

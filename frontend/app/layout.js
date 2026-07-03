import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "台股監控",
  description: "Real-time Taiwan stock volume and price monitor",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-Hant" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}

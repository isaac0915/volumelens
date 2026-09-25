import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NavBar from "@/components/NavBar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "台股爆量雷達",
  description: "即時掃描台股上市櫃異常成交量",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-Hant" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="flex min-h-screen flex-col bg-gray-50 text-gray-900 antialiased">
        <NavBar />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t border-gray-200 py-6 text-center text-xs text-gray-400">
          資料來源：臺灣證券交易所、證券櫃檯買賣中心、Fugle。僅供參考，不構成投資建議。
        </footer>
      </body>
    </html>
  );
}

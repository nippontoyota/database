import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Registration Data Portal",
  description: "Filter and download vehicle registration data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

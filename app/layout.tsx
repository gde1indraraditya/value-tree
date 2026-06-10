import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Value Tree Builder",
  description: "Configurable value driver tree generator with AI insight",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

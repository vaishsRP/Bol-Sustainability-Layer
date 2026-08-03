import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bol Sustainability Brain",
  description: "Hackathon demo for a Bol sustainability scoring layer"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

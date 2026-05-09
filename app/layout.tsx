import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VersionNav - Agent Upgrade Advisor",
  description:
    "Compare agent releases and get profile-aware upgrade recommendations with sourced evidence."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

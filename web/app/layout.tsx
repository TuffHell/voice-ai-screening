import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import AmbientBackground from "@/components/AmbientBackground";
import CursorBubbles    from "@/components/CursorBubbles";

export const metadata: Metadata = {
  title: "Voice AI — Clinical Speech Screening",
  description:
    "Research-grade acoustic engine for the early identification of dysarthria, aphasia and healthy phonation.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AmbientBackground />
        <CursorBubbles />
        {children}
      </body>
    </html>
  );
}

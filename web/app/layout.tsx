import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import NeuralBackground from "@/components/NeuralBackground";
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
        <NeuralBackground />
        <CursorBubbles />
        {children}
      </body>
    </html>
  );
}

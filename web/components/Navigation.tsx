"use client";
import { motion } from "framer-motion";

const ITEMS = [
  { href: "#how-it-works", label: "Method" },
  { href: "#analyse",      label: "Analyse" },
  { href: "#demos",        label: "Demos" },
  { href: "#history",      label: "History" },
  { href: "#training",     label: "Train" },
  { href: "#about",        label: "About" },
];

export default function Navigation() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-ink-900/30 border-b border-white/[0.04]"
    >
      <div className="mx-auto max-w-7xl px-6 sm:px-12 py-4 flex items-center justify-between">
        <a href="#" className="flex items-center gap-2.5 group">
          <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-ice-500 to-ice-600
                           shadow-[0_0_20px_-4px_rgba(74,130,255,0.6)] flex items-center justify-center
                           transition-transform group-hover:rotate-[-6deg]">
            <span className="w-1.5 h-3 rounded-full bg-white/90" />
          </span>
          <span className="font-display text-lg tracking-tight text-ice-50">Voice AI</span>
        </a>
        <nav className="hidden md:flex items-center gap-6 text-sm text-ice-100/65">
          {ITEMS.map((it) => (
            <a key={it.href} href={it.href} className="hover:text-ice-50 transition-colors">
              {it.label}
            </a>
          ))}
        </nav>
        <a
          href="#analyse"
          className="text-xs uppercase tracking-[0.18em] font-semibold
                     text-ice-300 border border-ice-400/30 rounded-full px-4 py-2
                     hover:bg-ice-500/10 transition-colors"
        >
          Begin
        </a>
      </div>
    </motion.header>
  );
}

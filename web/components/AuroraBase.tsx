"use client";
/**
 * Always-on aurora background.
 *
 * Five overlapping radial-gradient layers (emerald, azure, violet, cyan,
 * dawn gold) slowly rotate around the viewport on independent
 * `background-position` paths. CSS animation runs entirely on the
 * compositor — no JS, no canvas, no per-pixel work, no possible blowouts,
 * no localised clusters. Visible everywhere on the page by definition
 * because it covers the entire fixed viewport behind the content.
 *
 * This is the layer the visitor sees first, on every section, every scroll
 * position. The fluid canvas above adds cursor interactivity on top of
 * this base — but if the fluid ever fails to load, this still looks
 * beautiful on its own.
 */
export default function AuroraBase() {
  return (
    <div
      aria-hidden
      className="fixed inset-0 pointer-events-none aurora-layer"
      style={{
        zIndex: -1,
      }}
    />
  );
}

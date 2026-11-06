import { useEffect } from "react";
import { avoid, clampToClip, overlaps, UNBOUNDED, type Rect } from "./touchGeometry";
import "./touchTargets.css";

const TARGETS = ".df-button, .df-nav-item, .df-field__control, .df-grouped-options__row";
/** Interactive surfaces that keep every pixel of their own (FE-022 FIX2 N2). */
const OBSTACLES = ".df-region-overlay__surface";
const LAYERS = "dialog, .df-side-nav-drawer, .df-annotation-popover";
interface Target { host: HTMLElement; layer: Element; box: DOMRect; hit: Rect; clip: Rect }
interface Obstacle { layer: Element; rect: Rect }

/** The client rectangle left visible by every ancestor that clips `element`.
 * Absolutely positioned hit areas count towards a scroll container's overflow,
 * so the part outside it would only add phantom scroll (FE-022 FIX2 N1).
 * An ancestor clips an absolute/fixed box only from its containing block up. */
function clipRect(element: Element): Rect {
  const clip = { ...UNBOUNDED };
  let position = getComputedStyle(element).position;
  for (let node = element.parentElement; node !== null && node !== document.body; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.display === "contents") continue;
    const containsFixed = style.transform !== "none" || style.filter !== "none" || /paint|layout|strict|content/.test(style.contain);
    if (position === "fixed" && !containsFixed) continue;
    if (position === "absolute" && style.position === "static" && !containsFixed) continue;
    const paint = /paint|strict|content/.test(style.contain);
    const box = node.getBoundingClientRect();
    const left = box.left + node.clientLeft;
    const top = box.top + node.clientTop;
    if (paint || style.overflowX !== "visible") {
      clip.left = Math.max(clip.left, left);
      clip.right = Math.min(clip.right, left + node.clientWidth);
    }
    if (paint || style.overflowY !== "visible") {
      clip.top = Math.max(clip.top, top);
      clip.bottom = Math.min(clip.bottom, top + node.clientHeight);
    }
    position = style.position;
  }
  return clip;
}

/** Invisible coarse-pointer targets. Partition tight gaps rather than letting
 * a later-painted sibling steal the earlier sibling's expanded hit area.
 * FE-022 FIX1 preserves Figma's visible geometry, including wrapped toolbars;
 * FIX2 keeps every hit area inside its clipping ancestors and off the canvas. */
export function useTouchTargets(): void {
  useEffect(() => {
    if (typeof ResizeObserver === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(pointer: coarse)");
    let frame = 0;
    let observed = new Set<HTMLElement>();
    const modified = new Set<HTMLElement>();
    const clear = () => {
      for (const host of modified) {
        delete host.dataset.touchTarget;
        for (const side of ["top", "right", "bottom", "left"]) host.style.removeProperty(`--touch-${side}`);
      }
      modified.clear();
    };
    const update = () => {
      frame = 0;
      if (!media.matches) {
        clear();
        resize.disconnect();
        observed.clear();
        return;
      }
      for (const host of modified) if (!host.isConnected) modified.delete(host);
      const minimum = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--control-height-lg"));
      const targets: Target[] = [];
      const elements = new Set(document.querySelectorAll<HTMLElement>(TARGETS));
      for (const element of observed) if (!elements.has(element)) resize.unobserve(element);
      for (const element of elements) {
        if (!observed.has(element)) resize.observe(element);
        const box = element.getBoundingClientRect();
        if (box.width === 0 || box.height === 0 || box.bottom < 0 || box.top > innerHeight) continue;
        const host = element.matches(".df-field__control")
          ? element.closest<HTMLElement>(".df-field__target") : element;
        if (host === null) continue;
        const dx = Math.max(0, (minimum - box.width) / 2);
        const dy = Math.max(0, (minimum - box.height) / 2);
        const layer = element.closest(LAYERS) ?? document.body;
        const hit = { left: box.left - dx, right: box.right + dx, top: box.top - dy, bottom: box.bottom + dy };
        targets.push({ host, layer, box, hit, clip: clipRect(host) });
      }
      observed = elements;
      // Only the visible part of a surface is interactive.
      const obstacles: Obstacle[] = [];
      for (const surface of document.querySelectorAll(OBSTACLES)) {
        const rect = surface.getBoundingClientRect();
        const clip = clipRect(surface);
        const shown = {
          left: Math.max(rect.left, clip.left), top: Math.max(rect.top, clip.top),
          right: Math.min(rect.right, clip.right), bottom: Math.min(rect.bottom, clip.bottom),
        };
        if (shown.right > shown.left && shown.bottom > shown.top) {
          obstacles.push({ layer: surface.closest(LAYERS) ?? document.body, rect: shown });
        }
      }
      const contain = (target: Target) => {
        clampToClip(target.hit, target.box, target.clip);
        for (const obstacle of obstacles) if (obstacle.layer === target.layer) avoid(target.hit, target.box, obstacle.rect);
      };
      for (const target of targets) contain(target);
      // Use the native edges: unequal-sized adjacent controls share their gap,
      // never each other's visible rectangle. Already-overlaid controls retain
      // the browser's own stacking (dialogs, popovers and their background).
      for (let i = 0; i < targets.length; i++) {
        const a = targets[i];
        for (let j = i + 1; j < targets.length; j++) {
          const b = targets[j];
          if (a.layer !== b.layer || !overlaps(a.hit, b.hit) || overlaps(a.box, b.box)) continue;
          const xGap = Math.max(b.box.left - a.box.right, a.box.left - b.box.right);
          const yGap = Math.max(b.box.top - a.box.bottom, a.box.top - b.box.bottom);
          if (xGap >= 0 && (yGap < 0 || xGap > yGap)) {
            const [left, right] = a.box.left < b.box.left ? [a, b] : [b, a];
            const middle = (left.box.right + right.box.left) / 2;
            // A wide control may not need 48px expansion itself, but still
            // shares the gap with its narrow neighbour without a dead zone.
            left.hit.right = left.hit.right === left.box.right ? middle : Math.min(left.hit.right, middle);
            right.hit.left = right.hit.left === right.box.left ? middle : Math.max(right.hit.left, middle);
          } else if (yGap >= 0) {
            const [top, bottom] = a.box.top < b.box.top ? [a, b] : [b, a];
            const middle = (top.box.bottom + bottom.box.top) / 2;
            top.hit.bottom = top.hit.bottom === top.box.bottom ? middle : Math.min(top.hit.bottom, middle);
            bottom.hit.top = bottom.hit.top === bottom.box.top ? middle : Math.max(bottom.hit.top, middle);
          }
        }
      }
      // Gap sharing may reach past a clip or onto a surface again.
      for (const target of targets) contain(target);
      for (const { host, box, hit } of targets) {
        // Pseudo-elements are positioned from the padding box, so compensate
        // for the control's border to reach the measured outer boundary.
        const style = getComputedStyle(host);
        const bounds = host.getBoundingClientRect();
        const values = {
          top: hit.top - bounds.top - parseFloat(style.borderTopWidth || "0"),
          right: bounds.right - hit.right - parseFloat(style.borderRightWidth || "0"),
          bottom: bounds.bottom - hit.bottom - parseFloat(style.borderBottomWidth || "0"),
          left: hit.left - bounds.left - parseFloat(style.borderLeftWidth || "0"),
        };
        // Do not create horizontal overflow at viewport boundaries.
        values.left = Math.max(values.left, -box.left);
        values.right = Math.max(values.right, box.right - document.documentElement.clientWidth);
        for (const [side, value] of Object.entries(values)) host.style.setProperty(`--touch-${side}`, `${value}px`);
        host.dataset.touchTarget = "";
        modified.add(host);
      }
    };
    const schedule = () => { if (frame === 0) frame = requestAnimationFrame(update); };
    const resize = new ResizeObserver(schedule);
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.body, { subtree: true, childList: true, attributes: true,
      attributeFilter: ["class", "hidden", "disabled", "aria-expanded", "data-open"] });
    window.addEventListener("resize", schedule);
    document.addEventListener("scroll", schedule, true);
    media.addEventListener("change", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", schedule);
      document.removeEventListener("scroll", schedule, true);
      media.removeEventListener("change", schedule);
      clear();
    };
  }, []);
}

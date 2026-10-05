import { describe, expect, it } from "vitest";
import { AttentionTracker } from "./attention.js";

describe("AttentionTracker", () => {
  it("counts dwell only while ≥50% visible and focused", () => {
    const t = new AttentionTracker();
    t.onVisibility(0.3, 0);
    expect(t.dwellMs(1000)).toBe(0);
    t.onVisibility(0.6, 1000);
    expect(t.dwellMs(2500)).toBe(1500);
    t.onFocus(false, 2500);
    expect(t.dwellMs(4000)).toBe(1500);
    t.onFocus(true, 4000);
    t.onVisibility(0.1, 5000);
    expect(t.dwellMs(9000)).toBe(2500);
    expect(t.snapshot(9000)).toMatchObject({ visible_ms: 2500, max_visibility: 0.6, focused: true, scroll_before_click: false });
  });

  it("never allows a claim without dwell and a pointer event", () => {
    const t = new AttentionTracker();
    t.onVisibility(1, 0);
    expect(t.canClaim(3000, 2999)).toBe(false);
    expect(t.canClaim(3000, 3000)).toBe(false); // dwell met, no pointer
    t.onPointer(3100);
    expect(t.canClaim(3000, 3100)).toBe(true);
    expect(t.snapshot(3100).pointer_event_ts).toBe(3100);
  });

  it("records scrolling", () => {
    const t = new AttentionTracker();
    t.onScroll();
    expect(t.snapshot(0).scroll_before_click).toBe(true);
  });
});

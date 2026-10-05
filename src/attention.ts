// Attention rules (SPEC §2.3): creative ≥ 50% visible for ≥ min_dwell_ms while the document is
// focused, plus a pointer-originated interaction. Pure state machine; the DOM feeds it events.
export type Attention = { visible_ms: number; max_visibility: number; focused: boolean; pointer_event_ts: number; scroll_before_click: boolean };

export class AttentionTracker {
  private visibleMs = 0;
  private maxVisibility = 0;
  private visibleSince: number | null = null;
  private focused = true;
  private ratio = 0;
  private pointerTs = 0;
  private scrolled = false;

  constructor(private readonly minVisibility = 0.5) {}

  private counting() { return this.focused && this.ratio >= this.minVisibility; }
  private settle(now: number) {
    if (this.visibleSince !== null) { this.visibleMs += now - this.visibleSince; this.visibleSince = null; }
    if (this.counting()) this.visibleSince = now;
  }

  onVisibility(ratio: number, now: number) { this.ratio = ratio; this.maxVisibility = Math.max(this.maxVisibility, ratio); this.settle(now); }
  onFocus(focused: boolean, now: number) { this.focused = focused; this.settle(now); }
  onPointer(now: number) { this.pointerTs = now; }
  onScroll() { this.scrolled = true; }

  pointerTs0() { return this.pointerTs > 0; }
  dwellMs(now: number) { return this.visibleMs + (this.visibleSince !== null ? now - this.visibleSince : 0); }
  dwellMet(minDwellMs: number, now: number) { return this.dwellMs(now) >= minDwellMs; }
  /** The claim is allowed only after dwell and a pointer event. */
  canClaim(minDwellMs: number, now: number) { return this.dwellMet(minDwellMs, now) && this.pointerTs > 0; }

  snapshot(now: number): Attention {
    return { visible_ms: Math.round(this.dwellMs(now)), max_visibility: this.maxVisibility, focused: this.focused, pointer_event_ts: this.pointerTs, scroll_before_click: this.scrolled };
  }
}

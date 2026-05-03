# ADR-012 — Runtime-Axis Layout for Movie Mode

- **Status:** Accepted (2026-05-03)
- **Affected phases:** Movie mode MM-1 (data model + cluster bands + runtime ruler)
- **Related:** ADR-011 (cluster as data primitive), ADR-013 (virtual stitch)

## Context

In movie mode, the canvas X-axis represents **movie runtime** — clusters are positioned by their cumulative start time. From the user direction:

> Horizontal stacking, X-axis = movie runtime. Clusters left-to-right by playback order.

The fundamental design question: **does a cluster's rendered width on screen equal its runtime in pixels, or does the cluster have a fixed compact body with the runtime shown as a separate band?**

Two options:

### Option A — Fixed inner layout, runtime band underneath

Cluster body is a fixed compact shape (3 columns: SB, IMG, VID). The cluster's runtime span is shown as a translucent rail underneath the cluster on the ruler — wider rail = longer cluster — but the cluster's working area stays uniform.

```
   RULER →  0:00         0:30          1:15          2:00
            ├────────────┼─────────────┼─────────────┤
            ║════════════║═════════════════════════════╗  ← runtime rails
   ┌────────┐      ┌────────┐                ┌────────┐
   │ Body   │      │ Body   │                │ Body   │      ← compact bodies
   │ fixed  │      │ fixed  │                │ fixed  │
   │ width  │      │ width  │                │ width  │
   └────────┘      └────────┘                └────────┘
```

### Option B — Cluster body width = runtime in pixels

Cluster's actual rendered width equals its runtime × pixelsPerSecond. Inner SB/IMG/VID columns squeeze or expand to fit.

```
   RULER →  0:00         0:30          1:15          2:00
            ├────────────┼─────────────┼─────────────┤
   ┌────────────┐  ┌──────────────────────┐    ┌─────────┐
   │ short      │  │ long cluster — body  │    │ medium  │
   │ cluster    │  │ stretched to fit     │    │ cluster │
   └────────────┘  └──────────────────────┘    └─────────┘
```

## Decision

**Option A: fixed inner layout, runtime band underneath.**

Cluster bodies use a consistent compact shape (3 columns: SB, IMG, VID at fixed widths). The cluster's runtime span is shown as a translucent rail on the ruler underneath the cluster — wider rail = longer cluster — but the cluster's working area stays uniform across short and long clusters.

Hovering or selecting a cluster highlights its span on the ruler. Click on the ruler band → pan canvas to that cluster.

## Consequences

### Positive

- **Short clusters don't get cramped, long clusters don't get sparse.** A 5-second cluster and a 5-minute cluster render the same compact body — both readable, both editable.
- **SB / IMG / VID nodes keep their existing widths.** No re-layout work for the per-scene render pipeline.
- **Drag-to-reorder feels predictable.** Clusters slide left-right in fixed-width units; no rubber-band stretching.
- **Runtime ruler is the source of truth for time.** Clusters sit on it visually but don't drive their own width from it.

### Negative

- The mapping between cluster width on screen and cluster duration is non-obvious. Users learning the system might expect a wider cluster = longer scene.
- Mitigation: the ruler band underneath each cluster makes duration visually explicit. Hover shows "0:30 → 1:15 (45s)" tooltip.

### Why not Option B

Option B feels more "correct" in a video-editor sense (timeline width = duration), but breaks badly for two reasons:

1. **Tiny clusters become unusable.** A 3-second cluster at 100 px/sec = 300 px wide — barely fits one node card. The user can't review prompts, click chips, or edit anything.
2. **Long clusters scroll forever.** A 5-minute cluster at the same scale = 30,000 px. Even at zoom 0.25 that's 7,500 px — multiple screens of horizontal scroll just to see one cluster's contents.

The fixed-body / variable-rail compromise gives both the visual time mapping and the consistent working space.

## Implementation notes

- **Layout**: `doLayout()` walks clusters in order, places each at `cluster.x = sum_prev_widths_with_gap`; cluster width derived from internal node widths + padding, NOT from runtime.
- **Ruler**: separate render pass, draws the timecode strip + per-cluster runtime rails. Rails are `runtime × pixelsPerSecond` wide, positioned independently of cluster body X.
- **Pan-to-cluster**: clicking a ruler band centers the cluster body on screen.

## Alternatives Considered

- **Hybrid: fixed minimum + variable max.** Cluster body grows from a min-width up to a configured max-width, scaling with runtime. Rejected — doesn't solve the long-cluster scroll problem; minimum can be reached by very different durations.
- **Two layout modes user can toggle.** Add complexity, no clear winner.
- **Runtime axis is logarithmic, not linear.** Mathematically clever but breaks user intuition (a 30s cluster looks like 90% of a 5-min cluster on a log scale).

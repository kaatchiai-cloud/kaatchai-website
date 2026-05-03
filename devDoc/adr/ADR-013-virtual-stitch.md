# ADR-013 — Virtual Stitching: No Cluster Files Mid-Flow

- **Status:** Accepted (2026-05-03)
- **Affected phases:** Movie mode MM-6 (per-cluster Send to Editor)
- **Related:** ADR-014 (editor round-trip contract)

## Context

When a cluster's videos are ready, the user can Send to Editor. The question: **does the cluster have a stitched single-file video that's handed to the editor, or is it a list of clip URLs that the editor concatenates at export?**

Three options:

### Option A — Pre-stitch on cluster ready

When all videos in a cluster are generated, immediately stitch them into one MP4 (server-side ffmpeg or client-side `MediaRecorder`). Cluster has a `stitchedVideoUrl` field. Send to Editor passes that URL.

### Option B — Virtual stitch (URL list)

Cluster never has a single-file video. Send to Editor passes a list of clip URLs in order. Editor's existing pipeline (already handles `videoTimelineItems` for reels) plays them in sequence and concatenates at export time.

### Option C — Lazy stitch on download

Same as B for editor send. Server-side concat triggered only on `↓ Download cluster` click — pay the cost once, only when there's a real artifact to ship.

## Decision

**Option C — virtual stitch + lazy server concat on download.**

The cluster never has a stitched mid-flow file. Sending to editor passes a URL list. Server-side ffmpeg concat happens **only** when the user clicks `↓ Download cluster` or `↓ Download movie`.

## Consequences

### Why C over A

If we pre-stitch on cluster ready, we waste work — the editor would need to *un*-stitch back into clips to align subtitles per scene. Then re-stitch on export. We'd be encoding video twice. Pre-stitching also blocks the editor send on a long-running concat job.

### Why C over B

Option B is great for the editor send path. But the user also wants to download a cluster as a single file in some cases (sharing a 30-second teaser without going through the editor). Option C handles that case without forcing pre-stitching on every cluster.

### Browser-handles-concat constraint

Concat at export time happens in the editor's existing pipeline:

- **MediaRecorder** for short outputs (< 30 min). Holds blob in RAM as it records; ceiling around 30–45 min at 1080p before browser RAM gets tight.
- **ffmpeg.wasm** for moderate outputs. Each input video must fit in WASM's ~2GB memory; concat-without-reencode is fast.
- **Streaming to disk via File System Access API** (Chrome/Edge) for arbitrarily long outputs.

For movies > 30 min total, route the **global Final → Editor** through server-side concat as a fallback. Per-cluster sends stay client-side because clusters are typically short by design.

### The virtual stitch UX

In the cluster Output node, show a faux preview that plays scene videos in sequence using JS — swap `<video>` src as each ends, preload the next, optional crossfade. To the user it looks like one continuous video. Internally it's still a list.

```
   ┌──────────────────────────┐
   │  CLUSTER 2 OUTPUT        │
   │  ───────────────────     │
   │  ▶ [virtual preview]     │  ← plays scene videos in sequence
   │     0:30 / 0:45          │
   │                          │
   │  Status: 5/5 ready       │
   │                          │
   │  [ → Editor ]            │  ← URL list to editor
   │  [ ↓ Download ]          │  ← triggers server concat
   └──────────────────────────┘
```

### Cost / infrastructure implications

- **No new mid-flow infrastructure.** No `/api/concat` endpoint required for editor sends.
- **One new endpoint at Phase 9** (optional): `/api/concat` for download. Receives URL list, runs ffmpeg concat demuxer (no re-encode), returns single MP4 URL. Stored on existing CDN.
- **No staleness problem.** When a user re-generates one scene, the cluster's "virtual stitch" updates automatically (it's just a list). No file to invalidate.

### Per-cluster vs global Final

- **Per-cluster Send to Editor**: always client-side URL list. Always works regardless of duration (clusters are by design short).
- **Global Final Send to Editor**: client-side for movies < 30 min. Server-side concat for longer. Threshold configurable.

## Alternatives Considered

- **Always pre-stitch (Option A)**: rejected — wastes work, blocks editor send, doubles encode cost.
- **Always virtual (Option B, no download support)**: rejected — leaves no path for "share my cluster" without going through full editor.
- **Server-side concat on every cluster ready**: rejected — burns server cycles for clusters the user may never download or ship.

## Implementation notes

- Cluster's "stitched" preview is a JS-only simulation, no real file
- `cluster.stitchedVideoUrl` is set only after explicit download triggers server concat — and even then, it's just a CDN URL, not a guarantee that all clips have been concat-ed (re-genning a scene invalidates `stitchedVideoUrl` and forces a new concat on next download)
- Editor receives `cluster.scenes.map(s => ({ videoUrl: s.videoUrl, duration: s.duration, prompt: s.prompt }))` — the existing `videoTimelineItems` shape

// GET /api/projects/[id]/generate/stream?jobId=X&from=N
//   Server-Sent Events endpoint that tails a job's event buffer.
//   The client sends its last-seen event index via `from` (default 0).
//   If the job is still running, new events are pushed live.
//   If the job already finished, the buffered events are replayed then the
//   connection closes (so a reconnecting tab rehydrates the full session).

import { NextRequest } from "next/server";
import { jobManager } from "@/lib/job-manager";
import { db } from "@/lib/db";
import type { StreamEvent } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId");
  const fromIdx = Number(url.searchParams.get("from") || "0");

  if (!jobId) {
    return new Response(JSON.stringify({ error: "jobId required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // Verify the job belongs to this project (isolation guard).
  const job = await db.generationJob.findUnique({ where: { id: jobId } });
  if (!job || job.projectId !== id) {
    return new Response(JSON.stringify({ error: "job not found for this project" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (ev: StreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const { unsubscribe, snapshot, finished } = jobManager.subscribe(
        jobId,
        fromIdx,
        (ev) => send(ev)
      );

      // Replay buffered events the client hasn't seen yet.
      for (const ev of snapshot) send(ev);

      // If the job is already finished (or not in memory at all), close after replay.
      if (finished) {
        // If no done event was in the snapshot, synthesize one from DB.
        const hasDone = snapshot.some((e) => e.type === "done");
        if (!hasDone) {
          send({
            type: "done",
            job: {
              id: job.id,
              projectId: job.projectId,
              status: job.status,
              prompt: job.prompt,
              tokensUsed: job.tokensUsed,
              filesCompleted: job.filesCompleted,
              error: job.error,
              startedAt: job.startedAt.toISOString(),
              finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
            },
          });
        }
        controller.close();
        closed = true;
        return;
      }

      // Heartbeat every 15s to keep proxies from timing out.
      const hb = setInterval(() => send({ type: "heartbeat" }), 15000);

      // Clean up on abort/close.
      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(hb);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

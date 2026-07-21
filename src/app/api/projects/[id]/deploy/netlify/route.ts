// POST /api/projects/[id]/deploy/netlify
//   body: { token, siteName? }
//   Deploys the project's files to Netlify as a new site.
//   Returns { url, siteName, adminUrl }.
//
// Netlify API flow:
//   1. POST https://api.netlify.com/api/v1/sites  (with zip as file body)
//      → creates a new site + deploys in one call, returns the live URL.
//   The user provides a personal access token from their Netlify account
//   (User settings → Applications → Personal access tokens).

import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// GET — friendly info message (prevents 405 in terminal on prefetch/direct nav)
export async function GET() {
  return NextResponse.json({
    error: "This endpoint requires a POST request with { token, siteName? }.",
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const project = await db.project.findUnique({ where: { id } });
  if (!project || project.userId !== user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const token = (body.token as string)?.trim();
  const siteName = (body.siteName as string)?.trim();

  if (!token)
    return NextResponse.json({ error: "Netlify token required" }, { status: 400 });

  const files = await db.projectFile.findMany({
    where: { projectId: id },
    orderBy: { path: "asc" },
  });

  if (files.length === 0) {
    return NextResponse.json({ error: "No files to deploy. Generate something first." }, { status: 400 });
  }

  // Build the zip.
  const zip = new JSZip();
  for (const f of files) {
    zip.file(f.path, f.content);
  }
  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

  // Deploy to Netlify: POST the zip to create a new site.
  // If siteName is provided, use it as the subdomain.
  const url = siteName
    ? `https://api.netlify.com/api/v1/sites?name=${encodeURIComponent(siteName)}`
    : "https://api.netlify.com/api/v1/sites";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/zip",
      },
      body: zipBuffer,
      signal: AbortSignal.timeout(55000),
    });

    const data = await res.json();

    if (!res.ok) {
      const message =
        data?.message ||
        (res.status === 401
          ? "Invalid Netlify token. Get one at https://app.netlify.com/user/applications#personal-access-tokens"
          : res.status === 422
            ? "Site name already taken or invalid. Try a different name."
            : `Netlify deploy failed (HTTP ${res.status})`);
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const liveUrl = data.ssl_url || data.url || `https://${data.subdomain}.netlify.app`;
    const finalSiteName = data.subdomain || data.name || siteName;
    const adminUrl = data.admin_url;

    // Record the deployment.
    await db.deployment.create({
      data: {
        projectId: id,
        target: "netlify",
        url: liveUrl,
        siteName: finalSiteName,
        status: "live",
      },
    });

    return NextResponse.json({
      url: liveUrl,
      siteName: finalSiteName,
      adminUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: /timeout|abort/i.test(message) ? "Deploy timed out. Try again." : message },
      { status: 500 }
    );
  }
}

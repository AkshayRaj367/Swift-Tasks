// GET /api/projects/[id]/export
//   Downloads the project's files as a ZIP archive.
//   Uses JSZip server-side. Each file is stored at its relative path.

import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const project = await db.project.findUnique({ where: { id } });
  if (!project || project.userId !== user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const files = await db.projectFile.findMany({
    where: { projectId: id },
    orderBy: { path: "asc" },
  });

  if (files.length === 0) {
    return NextResponse.json({ error: "No files to export" }, { status: 400 });
  }

  const zip = new JSZip();
  for (const f of files) {
    zip.file(f.path, f.content);
  }

  // Add a small README.
  zip.file(
    "README.md",
    `# ${project.name}\n\nExported from Swift Tasks on ${new Date().toISOString()}.\n\n${project.description || ""}\n\n## Files\n\n${files.map((f) => `- \`${f.path}\``).join("\n")}\n`
  );

  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  // Sanitize project name for filename.
  const safeName = project.name.replace(/[^a-zA-Z0-9-_]/g, "_").toLowerCase();

  return new NextResponse(buffer, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${safeName}.zip"`,
      "content-length": String(buffer.length),
    },
  });
}

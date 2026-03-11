/**
 * POST /api/report
 *
 * Regenerates a markdown report from a stored pipeline result.
 * Accepts the full pipeline + snapshot, returns { projectId, report }.
 *
 * Body: ReportInput (projectId, snapshot, pipeline)
 * Response: { projectId: string, report: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { generateReport, ReportInput } from "@/lib/reporter";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ReportInput;

    if (!body.projectId || !body.snapshot || !body.pipeline) {
      return NextResponse.json(
        { error: "projectId, snapshot, and pipeline are required" },
        { status: 400 },
      );
    }

    const report = generateReport(body);

    return NextResponse.json({ projectId: body.projectId, report });
  } catch (error: any) {
    console.error("[/api/report]", error);
    return NextResponse.json(
      { error: error.message ?? "Internal server error" },
      { status: 500 },
    );
  }
}

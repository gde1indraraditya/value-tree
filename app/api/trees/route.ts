import { NextResponse } from "next/server";
import { createTree, listTrees } from "@/lib/repo";
import { TreeType } from "@/lib/types";

export async function GET() {
  try {
    return NextResponse.json(await listTrees());
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to list trees" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { name?: string; businessUnit?: string; type?: TreeType };
    const name = body.name?.trim();
    const type = body.type;
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (type !== "financial" && type !== "qualitative") {
      return NextResponse.json({ error: "type must be 'financial' or 'qualitative'" }, { status: 400 });
    }
    const tree = await createTree({
      name,
      businessUnit: body.businessUnit?.trim() || "General",
      type,
    });
    return NextResponse.json(tree, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to create tree" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { deleteTree, getTree, renameTree, saveTree } from "@/lib/repo";
import { ValueTree } from "@/lib/types";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const tree = await getTree(id);
    if (!tree) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(tree);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to load tree" }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const tree = (await req.json()) as ValueTree;
    if (!tree?.rootId || !tree.nodes) {
      return NextResponse.json({ error: "Invalid tree payload" }, { status: 400 });
    }
    if (tree.id !== id) {
      return NextResponse.json({ error: "Tree id mismatch" }, { status: 400 });
    }
    await saveTree(tree);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to save tree" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { name?: string };
    const name = body.name?.trim();
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    await renameTree(id, name);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to rename tree" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteTree(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to delete tree" }, { status: 500 });
  }
}

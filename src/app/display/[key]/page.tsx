import { notFound } from "next/navigation";
import { getDb } from "@/platform/db";
import { getDisplayBoard } from "@/modules/admin/service";
import { DisplayBoardView } from "./DisplayBoardView";
export const dynamic = "force-dynamic";
export const metadata = { title: "Order status", robots: { index: false } };
export default async function Page({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const board = await getDisplayBoard(await getDb(), key);
  if (!board) notFound();
  return <DisplayBoardView board={board} />;
}

"use client";
import { LuPrinter } from "react-icons/lu";
import { Button } from "@/ui/Button";
export function PrintButton() { return <Button variant="outline" icon={<LuPrinter className="size-4" />} onClick={() => window.print()}>Print receipt</Button>; }

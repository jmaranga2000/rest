import { LuMonitorPlay, LuPlus } from "react-icons/lu";
import { Button } from "@/ui/Button";
import { Card, CardBody, CardHeader } from "@/ui/Card";
import { ConfirmButton, Field, FormDialog } from "@/ui/ActionForm";
import { Input, Select, Switch } from "@/ui/inputs";
import { EmptyState, PageHeader } from "@/ui/misc";
import { deleteSlideAction, saveSlideAction } from "../actions";
import type { SlideRow } from "../service";
import type { ReactNode } from "react";

function SlideDialog({ slide, branches, trigger }: { slide?: SlideRow; branches: { id: string; name: string }[]; trigger: ReactNode }) {
  return (<FormDialog trigger={trigger} title={slide ? "Edit slide" : "New slide"} size="md" action={saveSlideAction} successMessage="Slide saved">
    {slide ? <input type="hidden" name="id" value={slide.id} /> : null}
    <Field label="Headline" name="title" required><Input id="title" name="title" defaultValue={slide?.title} required autoFocus /></Field>
    <Field label="Text" name="body"><Input id="body" name="body" defaultValue={slide?.body} /></Field>
    <div className="grid grid-cols-3 gap-4"><Field label="Colour" name="accent"><Input id="accent" name="accent" type="color" defaultValue={slide?.accent ?? "#4338ca"} className="h-10 p-1" /></Field>
      <Field label="Seconds" name="durationS"><Input id="durationS" name="durationS" type="number" min={3} max={120} defaultValue={slide?.durationS ?? 8} /></Field>
      <Field label="Branch" name="branchId"><Select id="branchId" name="branchId" defaultValue={slide?.branchId ?? ""}><option value="">All</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field></div>
    {slide ? <Switch name="isActive" label="Showing" defaultChecked={slide.isActive} /> : null}</FormDialog>);
}

export function DisplaysPage({ slides, branches, origin }: { slides: SlideRow[]; branches: { id: string; name: string; displayKey: string }[]; origin: string }) {
  return (<>
    <PageHeader title="Customer displays" description="Open a branch's screen link on any TV or tablet. It shows order numbers moving from Preparing to Ready, plus your slides." actions={<SlideDialog branches={branches} trigger={<Button icon={<LuPlus className="size-4" />}>New slide</Button>} />} />
    <Card className="mb-6"><CardHeader title="Screen links" description="Anyone with the link can see order numbers (no names or amounts). Treat it like a private URL." /><CardBody className="space-y-2">
      {branches.map((b) => <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-medium">{b.name}</span><a className="break-all text-primary hover:underline" href={`/display/${b.displayKey}`} target="_blank" rel="noreferrer">{origin}/display/{b.displayKey}</a></div>)}</CardBody></Card>
    <Card><CardHeader title="Slides" />{!slides.length ? <EmptyState icon={<LuMonitorPlay className="size-6" />} title="No slides yet" description="Promote specials or share Wi-Fi details between orders." /> : (
      <CardBody className="grid gap-3 sm:grid-cols-2">{slides.map((s) => (<div key={s.id} className="rounded-xl p-4 text-white" style={{ background: s.accent, opacity: s.isActive ? 1 : 0.5 }}>
        <div className="font-semibold">{s.title}</div><div className="text-sm text-white/85">{s.body}</div><div className="mt-3 flex items-center gap-1 text-xs text-white/80">{s.durationS}s{!s.isActive ? " · hidden" : ""}
          <span className="ml-auto flex gap-1"><SlideDialog slide={s} branches={branches} trigger={<button className="rounded bg-white/20 px-2 py-1 hover:bg-white/30">Edit</button>} /><ConfirmButton action={deleteSlideAction} input={{ id: s.id }} title="Delete slide?" variant="ghost" danger confirmLabel="Delete">×</ConfirmButton></span></div></div>))}</CardBody>)}</Card></>);
}

import { requirePage } from "@/platform/http/request";
import { availableRooms, nightsBetween } from "@/modules/rooms/service";
import { PageHeader } from "@/ui/misc";
import { Card, CardBody } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Input } from "@/ui/inputs";
import { NewBookingForm } from "@/modules/rooms/views/BookingForms";
import { RoomsTabs } from "@/modules/rooms/views/RoomsPages";
import { businessDate } from "@/platform/dates";

export const metadata = { title: "New booking" };
export const dynamic = "force-dynamic";
const D = /^\d{4}-\d{2}-\d{2}$/;
export default async function Page({ searchParams }: { searchParams: Promise<{ in?: string; out?: string }> }) {
  const ctx = await requirePage({ permission: "bookings.manage", feature: "rooms" });
  const sp = await searchParams;
  const branch = ctx.activeBranch!;
  const today = businessDate(new Date(), branch.timezone || ctx.org.timezone);
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const checkIn = sp.in && D.test(sp.in) ? sp.in : today;
  const checkOut = sp.out && D.test(sp.out) ? sp.out : tomorrow;
  const valid = nightsBetween(checkIn, checkOut) >= 1;
  const free = valid ? await availableRooms(ctx, branch.id, checkIn, checkOut) : [];
  return (
    <>
      <PageHeader back={{ href: "/app/rooms/bookings", label: "Bookings" }} title="New booking" description="Pick the dates first, then a free room." />
      <RoomsTabs tab="bookings" />
      <div className="max-w-3xl space-y-5">
        <Card><CardBody>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="text-[13px] font-medium">Check-in<Input type="date" name="in" defaultValue={checkIn} min={today} className="mt-1.5" /></label>
            <label className="text-[13px] font-medium">Check-out<Input type="date" name="out" defaultValue={checkOut} min={checkIn} className="mt-1.5" /></label>
            <Button type="submit" variant="outline">Find rooms</Button>
            {valid ? <span className="pb-2 text-sm text-muted">{nightsBetween(checkIn, checkOut)} night(s) · {free.length} room(s) free</span> : <span className="pb-2 text-sm text-danger">Check-out must be after check-in.</span>}
          </form>
        </CardBody></Card>
        {valid && free.length > 0 ? <Card><CardBody><NewBookingForm branchId={branch.id} checkIn={checkIn} checkOut={checkOut} currency={ctx.org.currency} rooms={free.map((r) => ({ id: r.id, number: r.number, typeName: r.typeName, rateMinor: r.rateMinor, capacity: r.capacity }))} /></CardBody></Card> : null}
        {valid && free.length === 0 ? <p className="text-sm text-muted">No rooms are free for those dates.</p> : null}
      </div>
    </>
  );
}

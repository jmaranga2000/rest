"use client";
import { ActionForm, Field, FormDialog, SubmitButton } from "@/ui/ActionForm";
import { Button } from "@/ui/Button";
import { Input, Select, Textarea } from "@/ui/inputs";
import { MoneyInput } from "@/ui/MoneyInput";
import { useState, type ReactNode } from "react";
import { bookingPaymentAction, checkInAction, checkOutAction, createBookingAction, regenerateStayCodeAction } from "../actions";

export function NewBookingForm({ branchId, checkIn, checkOut, rooms, currency }: { branchId: string; checkIn: string; checkOut: string; rooms: { id: string; number: string; typeName: string; rateMinor: number; capacity: number }[]; currency: string }) {
  const [sel, setSel] = useState(rooms[0]?.id ?? "");
  const room = rooms.find((r) => r.id === sel);
  return (
    <ActionForm action={createBookingAction} successMessage="Booking created" redirectTo={(d: { id: string }) => `/app/rooms/bookings/${d.id}`} className="space-y-4">
      <input type="hidden" name="branchId" value={branchId} /><input type="hidden" name="checkIn" value={checkIn} /><input type="hidden" name="checkOut" value={checkOut} />
      <Field label="Room" name="roomId" required>
        <Select id="roomId" name="roomId" value={sel} onChange={(e) => setSel(e.target.value)} required>{rooms.map((r) => <option key={r.id} value={r.id}>{`Room ${r.number} · ${r.typeName} · sleeps ${r.capacity}`}</option>)}</Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Guest name" name="guestName" required><Input id="guestName" name="guestName" required /></Field>
        <Field label="Adults" name="adults"><Input id="adults" name="adults" type="number" min={1} defaultValue={1} /></Field>
        <Field label="Phone" name="guestPhone"><Input id="guestPhone" name="guestPhone" inputMode="tel" /></Field>
        <Field label="Email" name="guestEmail"><Input id="guestEmail" name="guestEmail" type="email" /></Field>
      </div>
      <Field label="Rate per night" name="rateMinor" hint="Pre-filled from the room type; change it for a negotiated rate."><MoneyInput key={sel} name="rateMinor" currency={currency} defaultMinor={room?.rateMinor ?? 0} required /></Field>
      <Field label="Notes" name="notes"><Textarea id="notes" name="notes" rows={2} /></Field>
      <SubmitButton>Create booking</SubmitButton>
    </ActionForm>
  );
}

export function PaymentDialog({ bookingId, currency, balanceMinor, trigger }: { bookingId: string; currency: string; balanceMinor: number; trigger: ReactNode }) {
  return (
    <FormDialog trigger={trigger} title="Take payment" description="Recorded against this guest's folio." action={bookingPaymentAction} successMessage="Payment recorded" size="sm">
      <input type="hidden" name="id" value={bookingId} />
      <Field label="Method" name="method"><Select id="method" name="method" defaultValue="cash"><option value="cash">Cash</option><option value="card">Card</option><option value="mpesa">M-Pesa</option><option value="bank">Bank transfer</option><option value="other">Other</option></Select></Field>
      <Field label="Amount" name="amountMinor" required><MoneyInput name="amountMinor" currency={currency} defaultMinor={Math.max(0, balanceMinor)} required /></Field>
      <Field label="Reference" name="reference"><Input id="reference" name="reference" placeholder="Receipt / transaction no." /></Field>
    </FormDialog>
  );
}

export function CheckOutDialog({ bookingId, balanceMinor, canWaive, trigger }: { bookingId: string; balanceMinor: number; canWaive: boolean; trigger: ReactNode }) {
  return (
    <FormDialog trigger={trigger} title="Check out" description="Open room-service orders are posted to the folio first." action={checkOutAction} successMessage="Guest checked out" submitLabel="Check out">
      <input type="hidden" name="id" value={bookingId} />
      {balanceMinor > 0 ? (canWaive ? <>
        <p className="text-sm text-warning">A balance is still due. Take payment first, or waive it with a reason.</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="waive" value="on" className="size-4" /> Waive the remaining balance</label>
        <Field label="Reason" name="reason"><Input id="reason" name="reason" placeholder="e.g. Goodwill, complaint settled" /></Field></>
        : <p className="text-sm text-warning">A balance is still due. Take payment before checking out (waiving needs a manager).</p>) : <p className="text-sm text-muted">The folio is settled.</p>}
    </FormDialog>
  );
}

export function StayCodeButton({ bookingId }: { bookingId: string }) {
  const [code, setCode] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={async () => { const r = await regenerateStayCodeAction({ id: bookingId }); if (r.ok) setCode(r.data.code); }}>New code</Button>
      {code ? <span className="num rounded bg-surface-2 px-2 py-1 text-base font-semibold tracking-[0.25em]">{code}</span> : null}
    </div>
  );
}

export function CheckInButton({ bookingId, roomUrl }: { bookingId: string; roomUrl: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <Button loading={busy} onClick={async () => { setBusy(true); setErr(null); const r = await checkInAction({ id: bookingId }); setBusy(false); if (r.ok) setCode(r.data.stayCode); else setErr(r.error.message); }}>Check in</Button>
      {err ? <span role="alert" className="text-sm text-danger">{err}</span> : null}
      {code ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Guest checked in">
          <div className="w-full max-w-sm rounded-2xl bg-surface p-6 text-center shadow-2xl">
            <h2 className="text-lg font-semibold">Guest checked in</h2>
            <p className="mt-1 text-sm text-muted">Give the guest this room-service code. They enter it after scanning the QR code in the room.</p>
            <p className="num my-4 text-4xl font-bold tracking-[0.3em]">{code}</p>
            <p className="break-all text-xs text-muted">{roomUrl}</p>
            <Button className="mt-5 w-full" onClick={() => { setCode(null); window.location.reload(); }}>Done</Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

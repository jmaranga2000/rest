"use client";
import type { ReactNode } from "react";
import { FormDialog, Field } from "@/ui/ActionForm";
import { Input, Select, Textarea } from "@/ui/inputs";
import { MoneyInput } from "@/ui/MoneyInput";
import { saveRoomAction, saveRoomTypeAction } from "../actions";

export function RoomTypeDialog({ type, currency, trigger }: { type?: { id: string; name: string; description: string | null; baseRateMinor: number; capacity: number; amenities: string[] }; currency: string; trigger: ReactNode }) {
  return (
    <FormDialog trigger={trigger} title={type ? "Edit room type" : "New room type"} action={saveRoomTypeAction} successMessage="Room type saved">
      {type ? <input type="hidden" name="id" value={type.id} /> : null}
      <Field label="Name" name="name" required><Input id="name" name="name" defaultValue={type?.name} placeholder="Deluxe double" required autoFocus /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Rate per night" name="baseRateMinor" required><MoneyInput name="baseRateMinor" currency={currency} defaultMinor={type?.baseRateMinor} required /></Field>
        <Field label="Sleeps" name="capacity" required><Input id="capacity" name="capacity" type="number" min={1} max={20} defaultValue={type?.capacity ?? 2} /></Field>
      </div>
      <Field label="Amenities" name="amenities" hint="Comma separated"><Input id="amenities" name="amenities" defaultValue={type?.amenities.join(", ")} placeholder="Wi-Fi, TV, Balcony" /></Field>
      <Field label="Description" name="description"><Textarea id="description" name="description" rows={2} defaultValue={type?.description ?? ""} /></Field>
    </FormDialog>
  );
}

export function RoomDialog({ room, branchId, types, trigger }: { room?: { id: string; number: string; floor: string | null; roomTypeId: string; status: string }; branchId: string; types: { id: string; name: string }[]; trigger: ReactNode }) {
  return (
    <FormDialog trigger={trigger} title={room ? `Edit room ${room.number}` : "New room"} action={saveRoomAction} successMessage="Room saved" size="sm">
      {room ? <input type="hidden" name="id" value={room.id} /> : null}
      <input type="hidden" name="branchId" value={branchId} />
      <div className="grid grid-cols-2 gap-4">
        <Field label="Room number" name="number" required><Input id="number" name="number" defaultValue={room?.number} required autoFocus /></Field>
        <Field label="Floor" name="floor"><Input id="floor" name="floor" defaultValue={room?.floor ?? ""} /></Field>
      </div>
      <Field label="Type" name="roomTypeId" required><Select id="roomTypeId" name="roomTypeId" defaultValue={room?.roomTypeId} required>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
      <Field label="Housekeeping status" name="status"><Select id="status" name="status" defaultValue={room?.status ?? "ready"}><option value="ready">Ready</option><option value="cleaning">Needs cleaning</option><option value="maintenance">Out of service</option></Select></Field>
    </FormDialog>
  );
}

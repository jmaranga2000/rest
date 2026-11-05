"use client";
import { ActionForm, SubmitButton } from "@/ui/ActionForm";
import { Switch } from "@/ui/inputs";
import { saveQrSettingsAction } from "../actions";

export function QrSettingsForm({ enabled, autoSend, canEdit }: { enabled: boolean; autoSend: boolean; canEdit: boolean }) {
  return (
    <ActionForm action={saveQrSettingsAction} successMessage="QR ordering settings saved" className="space-y-4">
      <Switch name="qrOrderingEnabled" defaultChecked={enabled} disabled={!canEdit} label="Guests can order from their table" hint="Turn off to keep the codes printed but show the menu read-only." />
      <Switch name="qrAutoSend" defaultChecked={autoSend} disabled={!canEdit} label="Send QR orders straight to the kitchen" hint="Off = items wait on the order until a waiter sends them from the POS." />
      {canEdit ? <SubmitButton size="sm">Save</SubmitButton> : null}
    </ActionForm>
  );
}

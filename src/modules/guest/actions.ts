"use server";
import { definePublicAction, defineAction } from "@/platform/http/action";
import { clientMeta } from "@/platform/http/cookies";
import { NotFoundError } from "@/platform/errors";
import { audit } from "@/platform/audit/audit";
import { placeRoomSchema, placeSchema, qrSettingsSchema, statusSchema, tableIdSchema } from "./schema";
import { guestStatus, placeRoomOrder, placeTableOrder, regenerateTableToken, resolveRoom, resolveTable } from "./service";

/** Public: a guest at a table places an order. The QR token is the credential; see service.ts for the abuse limits. */
export const placeGuestOrderAction = definePublicAction({
  schema: placeSchema,
  handler: async (db, i) => placeTableOrder(db, { ...i, ip: (await clientMeta()).ip }),
});

export const guestStatusAction = definePublicAction({
  schema: statusSchema,
  handler: async (db, i) => {
    const s = await resolveTable(db, i.token);
    if (!s.ok) throw new NotFoundError("Table");
    return guestStatus(db, s.target, i.guestKey);
  },
});

export const saveQrSettingsAction = defineAction({
  schema: qrSettingsSchema, permission: "settings.manage",
  handler: async (ctx, i) => {
    await ctx.db.col("orgSettings").update({ id: ctx.org.id }, { $set: { qrOrderingEnabled: i.qrOrderingEnabled, qrAutoSend: i.qrAutoSend } });
    await audit(ctx, { action: "settings.qr", entityType: "organization", entityId: ctx.org.id, summary: `QR ordering ${i.qrOrderingEnabled ? "on" : "off"}, ${i.qrAutoSend ? "auto-send" : "staff confirm"}` });
    return null;
  },
});

export const regenerateTableQrAction = defineAction({
  schema: tableIdSchema, permission: "menu.manage",
  handler: async (ctx, i) => {
    await regenerateTableToken(ctx, i.id);
    await audit(ctx, { action: "table.qr_regenerated", entityType: "table", entityId: i.id, summary: "Regenerated table QR code" });
    return null;
  },
});

export const placeRoomOrderAction = definePublicAction({
  schema: placeRoomSchema,
  handler: async (db, i) => placeRoomOrder(db, { ...i, ip: (await clientMeta()).ip }),
});
export const roomStatusAction = definePublicAction({
  schema: statusSchema,
  handler: async (db, i) => {
    const s = await resolveRoom(db, i.token);
    if (!s.ok) throw new NotFoundError("Room");
    return guestStatus(db, s.target, i.guestKey);
  },
});

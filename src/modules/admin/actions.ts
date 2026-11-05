"use server";
import type { ActionResult } from "@/platform/http/action";
import { defineAction, definePublicAction } from "@/platform/http/action";
import { escapeHtml, sendEmail } from "@/platform/email";
import { env } from "@/platform/env";
import * as s from "./service";
import * as z from "./schema";

export const saveAreaAction = defineAction({ schema: z.areaSchema, permission: "floor.manage", handler: (c, i) => s.saveArea(c, i) });
export const deleteAreaAction = defineAction({ schema: z.idSchema, permission: "floor.manage", handler: async (c, i) => { await s.deleteArea(c, i.id); return null; } });
export const saveTableAction = defineAction({ schema: z.tableSchema, permission: "floor.manage", handler: (c, i) => s.saveTable(c, i) });
export const removeTableAction = defineAction({ schema: z.idSchema, permission: "floor.manage", handler: async (c, i) => { await s.removeTable(c, i.id); return null; } });
export const saveStaffAction = defineAction({ schema: z.staffSchema, permission: "staff.manage", handler: (c, i) => s.saveStaff(c, i) });
export const staffStatusAction = defineAction({ schema: z.staffStatusSchema, permission: "staff.manage", handler: async (c, i) => { await s.setStaffStatus(c, i.id, i.status); return null; } });
const createInvitationAction = defineAction({ schema: z.inviteSchema, permission: "staff.manage", handler: (c, i) => s.createInvitation(c, i) });
export async function inviteAction(input: unknown): Promise<ActionResult<{ token: string; email: string; emailSent: boolean }>> {
  const result = await createInvitationAction(input);
  if (!result.ok) return result;

  const invitation = result.data;
  let emailSent = false;
  try {
    const invitationUrl = `${env().APP_URL.replace(/\/+$/, "")}/invite/${invitation.token}`;
    const orgName = escapeHtml(invitation.orgName);
    const link = escapeHtml(invitationUrl);
    await sendEmail({
      to: invitation.email,
      subject: `You're invited to join ${invitation.orgName}`,
      text: `You've been invited to join ${invitation.orgName}. Create your account using this link: ${invitationUrl}\n\nThe link expires in 7 days.`,
      html: `<p>You've been invited to join <strong>${orgName}</strong>.</p><p><a href="${link}">Accept your invitation</a></p><p>This link expires in 7 days.</p>`,
    });
    emailSent = true;
  } catch (error) {
    console.error("Staff invitation email delivery failed.", error);
  }
  return { ok: true, data: { token: invitation.token, email: invitation.email, emailSent } };
}
export const acceptInviteAction = definePublicAction({ honeypot: true, schema: z.acceptInviteSchema, handler: (db, i) => s.acceptInvitation(db, i) });
export const saveRoleAction = defineAction({ schema: z.roleSchema, permission: "roles.manage", handler: (c, i) => s.saveRole(c, i) });
export const deleteRoleAction = defineAction({ schema: z.idSchema, permission: "roles.manage", handler: async (c, i) => { await s.deleteRole(c, i.id); return null; } });
export const saveBranchAction = defineAction({ schema: z.branchSchema, permission: "branches.manage", handler: (c, i) => s.saveBranch(c, i) });
export const pairTerminalAction = defineAction({ schema: z.terminalSchema, permission: "terminals.manage", handler: (c, i) => s.pairTerminal(c, i) });
export const revokeTerminalAction = defineAction({ schema: z.idSchema, permission: "terminals.manage", handler: async (c, i) => { await s.revokeTerminal(c, i.id); return null; } });
export const saveSettingsAction = defineAction({ schema: z.settingsSchema, permission: "settings.manage", handler: async (c, i) => { await s.saveSettings(c, i); return null; } });
export const saveOrgProfileAction = defineAction({ schema: z.orgProfileSchema, permission: "settings.manage", handler: async (c, i) => { await s.saveOrgProfile(c, i); return null; } });
export const requestPlanAction = defineAction({ schema: z.planRequestSchema, permission: "billing.manage", handler: async (c, i) => { await s.requestPlanChange(c, i.toPlan, i.note); return null; } });
export const onboardingAction = defineAction({ schema: z.onboardingSchema, permission: "settings.manage", handler: async (c, i) => { await s.completeOnboarding(c, i); return null; } });
export const saveSlideAction = defineAction({ schema: z.slideSchema, permission: "displays.manage", feature: "displays", handler: (c, i) => s.saveSlide(c, i) });
export const deleteSlideAction = defineAction({ schema: z.idSchema, permission: "displays.manage", feature: "displays", handler: async (c, i) => { await s.deleteSlide(c, i.id); return null; } });

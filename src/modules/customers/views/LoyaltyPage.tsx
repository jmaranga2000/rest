"use client";
import { LuGift, LuPencil, LuPlus, LuTrash2 } from "react-icons/lu";
import { ActionForm, ConfirmButton, Field, SubmitButton } from "@/ui/ActionForm";
import { Badge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { Card, CardBody, CardHeader } from "@/ui/Card";
import { Input, Switch } from "@/ui/inputs";
import { MoneyInput } from "@/ui/MoneyInput";
import { EmptyState, PageHeader } from "@/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/ui/Table";
import { formatMoney } from "@/platform/money";
import { deactivateRewardAction, saveLoyaltySettingsAction } from "../actions";
import type { Reward } from "../service";
import { RewardDialog } from "./CustomerDialogs";

export function LoyaltyPage({ rewards, currency, settings }: { rewards: Reward[]; currency: string; settings: { enabled: boolean; earnPointsPer100: number; pointValueMinor: number } }) {
  const describe = (r: Reward) => (r.kind === "amount_off" ? `${formatMoney(r.value, currency, { hideZeroDecimals: true })} off` : `${r.value / 100}% off`);
  return (
    <>
      <PageHeader title="Loyalty" description="Reward regulars with points they can redeem on their bill." />
      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader title="Program" description="How customers earn points." />
          <CardBody>
            <ActionForm action={saveLoyaltySettingsAction} successMessage="Loyalty settings saved" className="space-y-4">
              <Switch name="enabled" label="Loyalty program" hint="Earn points on paid orders." defaultChecked={settings.enabled} />
              <Field label={`Points earned per 100 ${currency}`} name="earnPointsPer100"><Input id="earnPointsPer100" name="earnPointsPer100" type="number" min={0} max={1000} defaultValue={settings.earnPointsPer100} /></Field>
              <Field label="Value of one point" name="pointValueMinor" hint="Used for reporting the liability of unredeemed points."><MoneyInput name="pointValueMinor" currency={currency} defaultMinor={settings.pointValueMinor} /></Field>
              <SubmitButton className="w-full">Save settings</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Rewards" description="What points can be exchanged for." actions={<RewardDialog currency={currency} trigger={<Button size="sm" icon={<LuPlus className="size-4" />}>New reward</Button>} />} />
          {rewards.length === 0 ? <EmptyState icon={<LuGift />} title="No rewards yet" description="Create a reward such as “KSh 200 off for 200 points”." /> : (
            <Table>
              <THead><TR><TH>Reward</TH><TH align="right">Cost</TH><TH>Value</TH><TH>Status</TH><TH /></TR></THead>
              <TBody>{rewards.map((r) => (
                <TR key={r.id} className={r.isActive ? "" : "opacity-60"}>
                  <TD className="font-medium">{r.name}</TD><TD align="right">{r.pointsCost} pts</TD><TD>{describe(r)}</TD>
                  <TD>{r.isActive ? <Badge tone="success" dot>Active</Badge> : <Badge dot>Inactive</Badge>}</TD>
                  <TD align="right"><div className="flex justify-end gap-1">
                    <RewardDialog reward={r} currency={currency} trigger={<Button variant="ghost" size="sm" icon={<LuPencil className="size-3.5" />}>Edit</Button>} />
                    {r.isActive ? <ConfirmButton action={deactivateRewardAction} input={{ id: r.id }} title={`Deactivate "${r.name}"?`} description="Customers will no longer be able to redeem it." confirmLabel="Deactivate" danger variant="ghost" icon={<LuTrash2 className="size-3.5" />}>{""}</ConfirmButton> : null}
                  </div></TD>
                </TR>))}</TBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}

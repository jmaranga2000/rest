import type { Db } from "../db";

export type OrderType = "dine_in" | "takeaway" | "delivery" | "pickup" | "room_service";
export type PaymentMethod = "cash" | "mpesa" | "card" | "paystack" | "bank" | "voucher" | "room" | "other";
/** Types an owner can switch on in settings. `room_service` is created only by the rooms module. */
export const ORDER_TYPES: readonly OrderType[] = ["dine_in", "takeaway", "delivery", "pickup"];
export const PAYMENT_METHODS: readonly PaymentMethod[] = ["cash", "mpesa", "card", "paystack", "bank", "voucher", "other"];
export const ORDER_TYPE_LABEL: Record<OrderType, string> = { dine_in: "Dine in", takeaway: "Takeaway", delivery: "Delivery", pickup: "Pickup", room_service: "Room service" };
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = { cash: "Cash", mpesa: "M-Pesa", card: "Card", paystack: "Paystack", bank: "Bank transfer", voucher: "Voucher", room: "Charged to room", other: "Other" };

export interface OrgSettings {
  taxLabel: string;
  taxRateBp: number;
  taxInclusive: boolean;
  serviceChargeBp: number;
  serviceChargeTaxable: boolean;
  serviceChargeTypes: OrderType[];
  orderTypes: OrderType[];
  paymentMethods: PaymentMethod[];
  requireShiftForCash: boolean;
  allowNegativeStock: boolean;
  kitchenLateMinutes: number;
  receiptHeader: string;
  receiptFooter: string;
  loyaltyEnabled: boolean;
  loyaltyEarnPointsPer100: number;
  loyaltyPointValueMinor: number;
  /** Guests may order from their table by scanning its QR code. */
  qrOrderingEnabled: boolean;
  /** QR orders go straight to the kitchen; when off they wait for staff to confirm. */
  qrAutoSend: boolean;
}

export interface SettingsRow {
  taxLabel: string; taxRateBp: number; taxInclusive: boolean; serviceChargeBp: number; serviceChargeTaxable: boolean;
  serviceChargeTypes: OrderType[]; orderTypes: OrderType[]; paymentMethods: PaymentMethod[]; requireShiftForCash: boolean;
  allowNegativeStock: boolean; kitchenLateMinutes: number; receiptHeader: string; receiptFooter: string;
  loyaltyEnabled: boolean; loyaltyEarnPointsPer100: number; loyaltyPointValueMinor: number;
  qrOrderingEnabled?: boolean; qrAutoSend?: boolean;
}

export function mapSettings(r: SettingsRow): OrgSettings {
  return {
    taxLabel: r.taxLabel,
    taxRateBp: Number(r.taxRateBp),
    taxInclusive: r.taxInclusive,
    serviceChargeBp: Number(r.serviceChargeBp),
    serviceChargeTaxable: r.serviceChargeTaxable,
    serviceChargeTypes: r.serviceChargeTypes ?? ["dine_in"],
    orderTypes: r.orderTypes ?? ["dine_in", "takeaway"],
    paymentMethods: r.paymentMethods ?? ["cash"],
    requireShiftForCash: r.requireShiftForCash,
    allowNegativeStock: r.allowNegativeStock,
    kitchenLateMinutes: Number(r.kitchenLateMinutes),
    receiptHeader: r.receiptHeader,
    receiptFooter: r.receiptFooter,
    loyaltyEnabled: r.loyaltyEnabled,
    loyaltyEarnPointsPer100: Number(r.loyaltyEarnPointsPer100),
    loyaltyPointValueMinor: Number(r.loyaltyPointValueMinor),
    qrOrderingEnabled: r.qrOrderingEnabled ?? true,
    qrAutoSend: r.qrAutoSend ?? true,
  };
}

export async function loadSettings(db: Db, orgId: string): Promise<OrgSettings> {
  const row = await db.col<SettingsRow & { id: string }>("orgSettings").findOne({ id: orgId });
  if (!row) throw new Error(`org_settings missing for ${orgId}`);
  return mapSettings(row);
}

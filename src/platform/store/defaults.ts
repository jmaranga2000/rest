/** Column defaults carried over from the original relational schema. Applied on insert (caller values win). */
export const DEFAULTS: Record<string, Record<string, unknown>> = {
 "plans": {
  "description": "",
  "priceMinor": 0,
  "currency": "KES",
  "billingInterval": "month",
  "trialDays": 14,
  "limits": {},
  "features": [],
  "highlights": [],
  "isPublic": true,
  "isActive": true,
  "sortOrder": 0
 },
 "platformAdmins": {
  "isActive": true
 },
 "platformAuditLogs": {
  "summary": ""
 },
 "counters": {
  "branchId": ""
 },
 "organizations": {
  "country": "KE",
  "currency": "KES",
  "timezone": "Africa/Nairobi",
  "locale": "en-KE",
  "status": "active",
  "onboardingStatus": "in_progress",
  "onboardingStep": "business"
 },
 "orgSettings": {
  "taxLabel": "VAT",
  "taxRateBp": 1600,
  "taxInclusive": true,
  "serviceChargeBp": 0,
  "serviceChargeTaxable": false,
  "serviceChargeTypes": [
   "dine_in"
  ],
  "orderTypes": [
   "dine_in",
   "takeaway",
   "delivery"
  ],
  "paymentMethods": [
   "cash",
   "mpesa",
   "card"
  ],
  "requireShiftForCash": true,
  "allowNegativeStock": true,
  "kitchenLateMinutes": 15,
  "receiptHeader": "",
  "receiptFooter": "Thank you for dining with us!",
  "loyaltyEnabled": false,
  "loyaltyEarnPointsPer100": 1,
  "loyaltyPointValueMinor": 100
 },
 "subscriptions": {
  "cancelAtPeriodEnd": false
 },
 "planChangeRequests": {
  "status": "pending"
 },
 "branches": {
  "isActive": true
 },
 "roles": {
  "description": "",
  "isSystem": false,
  "allBranches": false
 },
 "users": {
  "status": "active",
  "color": "#4f46e5",
  "mustChangePassword": false
 },
 "terminals": {
  "isActive": true
 },
 "sessions": {
  "kind": "web"
 },
 "invitations": {
  "branchIds": []
 },
 "auditLogs": {
  "summary": ""
 },
 "events": {
  "payload": {}
 },
 "menuCategories": {
  "color": "#64748b",
  "sortOrder": 0,
  "isActive": true
 },
 "stations": {
  "sortOrder": 0,
  "isActive": true
 },
 "products": {
  "description": "",
  "isTaxExempt": false,
  "prepMinutes": 10,
  "sortOrder": 0,
  "isActive": true
 },
 "productVariants": {
  "isDefault": false,
  "sortOrder": 0
 },
 "modifierGroups": {
  "minSelect": 0,
  "maxSelect": 1,
  "isActive": true
 },
 "modifierOptions": {
  "priceMinor": 0,
  "sortOrder": 0,
  "isActive": true
 },
 "productModifierGroups": {
  "sortOrder": 0
 },
 "branchProducts": {
  "isAvailable": true
 },
 "floorAreas": {
  "sortOrder": 0
 },
 "diningTables": {
  "seats": 4,
  "sortOrder": 0,
  "isActive": true
 },
 "customers": {
  "notes": "",
  "pointsBalance": 0,
  "lifetimeSpendMinor": 0,
  "visits": 0,
  "isActive": true
 },
 "loyaltyRewards": {
  "isActive": true
 },
 "shifts": {
  "status": "open",
  "openingFloatMinor": 0
 },
 "orders": {
  "openedHour": 0,
  "status": "open",
  "taxRateBp": 0,
  "taxInclusive": true,
  "serviceChargeBp": 0,
  "serviceChargeTaxable": false,
  "rewardPoints": 0,
  "rewardDiscountMinor": 0,
  "subtotalMinor": 0,
  "discountMinor": 0,
  "serviceChargeMinor": 0,
  "taxMinor": 0,
  "totalMinor": 0,
  "paidMinor": 0,
  "tipMinor": 0,
  "version": 1
 },
 "orderItems": {
  "modifiersMinor": 0,
  "isTaxExempt": false,
  "status": "held",
  "round": 0
 },
 "orderItemModifiers": {
  "priceMinor": 0
 },
 "payments": {
  "changeMinor": 0,
  "tipMinor": 0
 },
 "suppliers": {
  "notes": "",
  "isActive": true
 },
 "inventoryItems": {
  "category": "General",
  "isActive": true
 },
 "stockLevels": {
  "qtyMilli": 0,
  "valueMinor": 0,
  "reorderLevelMilli": 0,
  "parLevelMilli": 0
 },
 "stockMovements": {
  "valueDeltaMinor": 0
 },
 "purchaseOrders": {
  "status": "draft",
  "notes": "",
  "totalMinor": 0
 },
 "purchaseOrderLines": {
  "receivedMilli": 0,
  "receivedTotalMinor": 0
 },
 "stockCounts": {
  "status": "open"
 },
 "signageSlides": {
  "body": "",
  "accent": "#4f46e5",
  "durationS": 8,
  "sortOrder": 0,
  "isActive": true
 }
};

/** Apply column defaults and drop `undefined` fields so both engines store identical documents. */
export function prepareInsert<T extends Record<string, unknown>>(collection: string, doc: T): T {
  const merged: Record<string, unknown> = { ...(DEFAULTS[collection] ? structuredClone(DEFAULTS[collection]) : {}), ...doc };
  for (const k of Object.keys(merged)) if (merged[k] === undefined) delete merged[k];
  return merged as T;
}

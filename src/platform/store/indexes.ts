import type { IndexSpec } from "./types";

const u = (collection: string, keys: IndexSpec["keys"], name: string, partial?: IndexSpec["partial"]): IndexSpec => ({ collection, keys, unique: true, name, ...(partial ? { partial } : {}) });
const i = (collection: string, keys: IndexSpec["keys"], name: string, partial?: IndexSpec["partial"]): IndexSpec => ({ collection, keys, name, ...(partial ? { partial } : {}) });

/**
 * Single source of truth for indexes. Unique indexes are what make the data model
 * safe (they replace the SQL UNIQUE constraints), so both engines enforce them.
 * Partial filters use only the subset MongoDB supports in partialFilterExpression.
 * Requires MongoDB >= 6.0 (for $in inside partial filters).
 */
export const INDEXES: IndexSpec[] = [
  // platform
  u("platformAdmins", { emailLower: 1 }, "platform_admins_email_uq"),
  u("platformSessions", { tokenHash: 1 }, "platform_sessions_token_uq"),
  i("platformAuditLogs", { createdAt: -1 }, "platform_audit_created_idx"),
  u("plans", { code: 1 }, "plans_code_uq"),
  // tenancy & billing
  u("organizations", { slug: 1 }, "organizations_slug_uq"),
  i("planChangeRequests", { status: 1, createdAt: 1 }, "plan_change_requests_status_idx"),
  i("billingPayments", { orgId: 1, createdAt: -1 }, "billing_payments_org_idx"),
  u("billingPayments", { reference: 1 }, "billing_paystack_ref_uq", { method: "paystack" }),
  // security
  i("securityEvents", { createdAt: -1 }, "security_events_created_idx"),
  i("securityEvents", { ip: 1, type: 1, createdAt: -1 }, "security_events_ip_idx"),
  // paystack
  u("paystackCharges", { reference: 1 }, "paystack_charges_ref_uq"),
  i("paystackCharges", { orgId: 1, orderId: 1, status: 1 }, "paystack_charges_order_idx"),
  u("branches", { displayKey: 1 }, "branches_display_key_uq"),
  u("branches", { orgId: 1, code: 1 }, "branches_code_uq"),
  u("roles", { orgId: 1, key: 1 }, "roles_key_uq"),
  u("users", { emailLower: 1 }, "users_email_uq", { emailLower: { $type: "string" } }),
  i("users", { orgId: 1, status: 1 }, "users_org_idx"),
  u("terminals", { tokenHash: 1 }, "terminals_token_uq", { tokenHash: { $type: "string" } }),
  u("sessions", { tokenHash: 1 }, "sessions_token_uq"),
  i("sessions", { userId: 1, revokedAt: 1 }, "sessions_user_idx"),
  u("invitations", { tokenHash: 1 }, "invitations_token_uq"),
  i("auditLogs", { orgId: 1, createdAt: -1 }, "audit_org_created_idx"),
  i("auditLogs", { orgId: 1, entityType: 1, entityId: 1 }, "audit_entity_idx"),
  i("events", { orgId: 1, branchId: 1, seq: 1 }, "events_branch_idx"),
  i("events", { createdAt: 1 }, "events_created_idx"),
  // catalogue
  u("menuCategories", { orgId: 1, name: 1 }, "categories_name_uq"),
  u("stations", { orgId: 1, name: 1 }, "stations_name_uq"),
  i("products", { orgId: 1, categoryId: 1, isActive: 1 }, "products_cat_idx"),
  u("products", { orgId: 1, sku: 1 }, "products_sku_uq", { sku: { $type: "string" } }),
  i("productVariants", { orgId: 1, productId: 1 }, "variants_product_idx"),
  i("modifierOptions", { orgId: 1, groupId: 1 }, "options_group_idx"),
  i("productModifierGroups", { orgId: 1, productId: 1 }, "pmg_product_idx"),
  i("branchProducts", { orgId: 1, branchId: 1 }, "branch_products_idx"),
  u("diningTables", { orgId: 1, branchId: 1, label: 1 }, "tables_label_uq"),
  u("diningTables", { qrToken: 1 }, "tables_qr_token_uq", { qrToken: { $type: "string" } }),
  i("orderItems", { orgId: 1, guestSubmitKey: 1 }, "order_items_guest_submit_idx", { guestSubmitKey: { $type: "string" } }),
  // rooms
  u("roomTypes", { orgId: 1, name: 1 }, "room_types_name_uq", { isActive: true }),
  u("rooms", { orgId: 1, branchId: 1, number: 1 }, "rooms_number_uq"),
  u("rooms", { qrToken: 1 }, "rooms_qr_token_uq"),
  u("bookings", { orgId: 1, number: 1 }, "bookings_number_uq"),
  i("bookings", { orgId: 1, roomId: 1, checkIn: 1 }, "bookings_room_idx"),
  i("bookings", { orgId: 1, branchId: 1, status: 1 }, "bookings_branch_status_idx"),
  i("orders", { orgId: 1, bookingId: 1 }, "orders_booking_idx", { bookingId: { $type: "string" } }),
  // customers & loyalty
  u("customers", { orgId: 1, phone: 1 }, "customers_phone_uq", { phone: { $type: "string" } }),
  i("loyaltyLedger", { orgId: 1, customerId: 1, createdAt: 1 }, "loyalty_ledger_customer_idx"),
  u("loyaltyLedger", { orgId: 1, orderId: 1, type: 1 }, "loyalty_earn_once_uq", { orderId: { $type: "string" }, type: { $in: ["earn", "redeem"] } }),
  // service
  u("shifts", { orgId: 1, branchId: 1, userId: 1 }, "shifts_one_open_uq", { status: "open" }),
  i("shifts", { orgId: 1, branchId: 1, openedAt: -1 }, "shifts_branch_idx"),
  i("cashMovements", { orgId: 1, shiftId: 1 }, "cash_movements_shift_idx"),
  u("orders", { orgId: 1, branchId: 1, businessDate: 1, seq: 1 }, "orders_number_uq"),
  u("orders", { orgId: 1, clientKey: 1 }, "orders_client_key_uq", { clientKey: { $type: "string" } }),
  i("orders", { orgId: 1, branchId: 1, status: 1, openedAt: 1 }, "orders_branch_status_idx"),
  i("orders", { orgId: 1, branchId: 1, businessDate: 1 }, "orders_date_idx"),
  i("orders", { orgId: 1, customerId: 1 }, "orders_customer_idx"),
  u("orders", { orgId: 1, tableId: 1 }, "orders_one_open_per_table_uq", { status: "open", tableId: { $type: "string" } }),
  i("orderItems", { orgId: 1, orderId: 1 }, "order_items_order_idx"),
  i("orderItems", { orgId: 1, status: 1, sentAt: 1 }, "order_items_kitchen_idx"),
  i("orderItems", { orgId: 1, productId: 1 }, "order_items_product_idx"),
  i("payments", { orgId: 1, orderId: 1 }, "payments_order_idx"),
  i("payments", { orgId: 1, branchId: 1, createdAt: 1 }, "payments_branch_idx"),
  i("payments", { orgId: 1, shiftId: 1 }, "payments_shift_idx"),
  u("payments", { orgId: 1, clientKey: 1 }, "payments_client_key_uq", { clientKey: { $type: "string" } }),
  // inventory & purchasing
  u("suppliers", { orgId: 1, name: 1 }, "suppliers_name_uq"),
  u("inventoryItems", { orgId: 1, name: 1 }, "inventory_name_uq"),
  i("stockMovements", { orgId: 1, branchId: 1, itemId: 1, createdAt: 1 }, "stock_movements_item_idx"),
  i("stockMovements", { orgId: 1, refType: 1, refId: 1 }, "stock_movements_ref_idx"),
  i("recipeLines", { orgId: 1, productId: 1 }, "recipe_product_idx"),
  u("purchaseOrders", { orgId: 1, number: 1 }, "po_number_uq"),
  i("purchaseOrderLines", { orgId: 1, poId: 1 }, "po_lines_po_idx"),
  i("signageSlides", { orgId: 1, isActive: 1, sortOrder: 1 }, "signage_org_idx"),
];

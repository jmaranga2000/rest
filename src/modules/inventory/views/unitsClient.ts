import type { BaseUnit } from "../units";
/** Display-unit helpers for forms (quantities are typed in kg / l / pcs, stored as milli of g / ml / pcs). */
export const itemUnits = (b: BaseUnit): string[] => (b === "g" ? ["kg", "g"] : b === "ml" ? ["l", "ml"] : ["pcs"]);
/** How many base units in one default display unit. */
export const UNIT_BASE: Record<BaseUnit, number> = { g: 1000, ml: 1000, pcs: 1 };
export const qtyFromDisplay = (milli: number, base: BaseUnit): number => Math.round((milli / 1000 / UNIT_BASE[base]) * 1000) / 1000;

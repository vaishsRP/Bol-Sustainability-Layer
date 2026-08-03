import type { Product } from "@/lib/product";

export function displayValue(value: string, fallback = "Not available"): string {
  const trimmed = value?.trim();

  if (!trimmed || trimmed === "None") {
    return fallback;
  }

  return trimmed;
}

export function parseNumber(value: string): number | null {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

export function formatEuro(value: number): string {
  return `€${value.toFixed(2)}`;
}

export function formatPrice(product: Product): string {
  const from = parseNumber(product.priceFrom);
  const to = parseNumber(product.priceTo);

  if (from !== null && to !== null && Math.abs(from - to) > 0.005) {
    return `${formatEuro(from)} - ${formatEuro(to)}`;
  }

  if (from !== null) {
    return formatEuro(from);
  }

  if (to !== null) {
    return formatEuro(to);
  }

  return "Price unavailable";
}

export function deliverySummary(product: Product): string {
  if (product.sameDay) {
    return "Arrives today";
  }

  if (product.nextDay) {
    return "Arrives tomorrow";
  }

  if (product.normalDelivery) {
    return "Arrives in 3-5 days";
  }

  return "Delivery calculated at checkout";
}

export function numericScore(score: string): number {
  return parseNumber(score) ?? 0;
}

export function leafCount(score: string): number {
  return Math.max(1, Math.min(5, Math.round(numericScore(score) / 20)));
}

export function confidenceTone(confidence: Product["confidenceLevel"]): "high" | "medium" | "low" {
  if (confidence === "Low") {
    return "low";
  }

  if (confidence === "Medium") {
    return "medium";
  }

  return "high";
}

export function productSavings(product: Product): { euro: number; co2: number } {
  return {
    euro: product.curatedAlternative?.euroSaving ?? Math.max(0, parseNumber(product.altPriceSavingEur) ?? 0),
    co2: product.curatedAlternative?.co2SavingKg ?? Math.max(0, parseNumber(product.altCo2SavingKg) ?? 0)
  };
}

export function hasAlternative(product: Product): boolean {
  return Boolean(product.curatedAlternative || product.greenerAlternativeProductId.trim());
}

export function isDigitalProduct(product: Product): boolean {
  return product.category === "Digital Goods";
}

export function scoreTone(score: string): "unknown" | "low" | "medium" | "high" {
  const numeric = parseNumber(score);

  if (numeric === null) {
    return "unknown";
  }

  if (numeric >= 75) {
    return "high";
  }

  if (numeric >= 45) {
    return "medium";
  }

  return "low";
}

export function hasClaimRisk(product: Product): boolean {
  return ["TRUE", "YES", "HIGH", "RISK"].includes(product.claimRiskFlag.trim().toUpperCase());
}

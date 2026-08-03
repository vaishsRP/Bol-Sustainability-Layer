import fs from "node:fs";
import path from "node:path";
import type { CuratedAlternative, Product } from "@/lib/product";

type RawRow = Record<string, string>;

type CuratedAlternativeFile = Record<
  string,
  | string
  | {
      alternative?: {
        name?: string;
        brand?: string;
        url?: string;
        price_eur?: number;
        sustainability_note?: string;
        co2_saving_kg?: number;
        euro_saving?: number;
      };
    }
>;

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

function parseCsv(csv: string): RawRow[] {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return headers.reduce<RawRow>((row, header, index) => {
      row[header] = cells[index] ?? "";
      return row;
    }, {});
  });
}

function boolValue(value: string): boolean {
  return value.trim().toUpperCase() === "TRUE";
}

function confidenceValue(value: string): Product["confidenceLevel"] {
  const normalized = value.trim();

  if (normalized === "High" || normalized === "Medium" || normalized === "Low") {
    return normalized;
  }

  return "";
}

function deliveryValue(value: string): Product["recommendedDeliveryDate"] {
  const normalized = value.trim();

  if (normalized === "Today" || normalized === "Next day" || normalized === "Standard") {
    return normalized;
  }

  return "";
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function loadCuratedAlternatives(): Map<string, CuratedAlternative> {
  const filePath = path.join(process.cwd(), "curated_alternatives.json");

  if (!fs.existsSync(filePath)) {
    return new Map();
  }

  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as CuratedAlternativeFile;
  const alternatives = new Map<string, CuratedAlternative>();

  for (const [productId, entry] of Object.entries(raw)) {
    if (productId.startsWith("_") || typeof entry === "string" || !entry.alternative) {
      continue;
    }

    alternatives.set(productId, {
      name: entry.alternative.name ?? "",
      brand: entry.alternative.brand ?? "",
      url: entry.alternative.url ?? "",
      priceEur: numberOrNull(entry.alternative.price_eur),
      sustainabilityNote: entry.alternative.sustainability_note ?? "",
      co2SavingKg: numberOrNull(entry.alternative.co2_saving_kg),
      euroSaving: numberOrNull(entry.alternative.euro_saving)
    });
  }

  return alternatives;
}

function mapRow(row: RawRow, curatedAlternatives: Map<string, CuratedAlternative>): Product {
  const product: Product = {
    id: row.Product_ID,
    name: row.Product_Name,
    category: row.Category,
    subcategory: row.Subcategory,
    priceFrom: row.Price_From_EUR,
    priceTo: row.Price_To_EUR,
    warehouseName: row.WarehouseName,
    warehouseCode: row.WarehouseCode,
    countryOfOrigin: row.Country_Of_Origin,
    packagingType: row.Packaging_Type,
    sameDay: boolValue(row.IsSameDayAvailable),
    nextDay: boolValue(row.IsNextDayAvailable),
    normalDelivery: boolValue(row.IsNormalDeliveryAvailable),
    co2Footprint: row.CO2_Footprint_kg,
    repairabilityScore: row.Repairability_Score,
    estimatedLifespanYears: row.Estimated_Lifespan_Years,
    materialRecyclablePct: row.Material_Recyclable_Pct,
    ecoLabel: row.Eco_Label,
    carbonNeutralCertified: row.Carbon_Neutral_Certified,
    packagingScore: row.Packaging_Score,
    materialTypeScore: row.Material_Type_Score,
    warehouseInfraScore: row.Warehouse_Infra_Score,
    subScore1: row.Sub_Score_1,
    transportScore: row.Transport_Score,
    logisticsPlausibilityScore: row.Logistics_Plausibility_Score,
    sellerHonestyScore: row.Seller_Honesty_Score,
    subScore2: row.Sub_Score_2,
    finalSustainabilityScore: row.Final_Sustainability_Score,
    confidenceLevel: confidenceValue(row.Confidence_Level),
    missingDataGaps: row.Missing_Data_Gaps,
    claimRiskFlag: row.Claim_Risk_Flag,
    claimRiskReason: row.Claim_Risk_Reason,
    recommendedDeliveryDate: deliveryValue(row.Recommended_Delivery_Date),
    deliveryImprovementPercent: row.Delivery_Improvement_Percent,
    greenerAlternativeProductId: row.Greener_Alternative_Product_ID,
    bolCertified: boolValue(row.Bol_Certified),
    ecoLabelScope: row.Eco_Label_Scope,
    priceSustainabilityScore: row.Price_Sustainability_Score,
    alternativePriceDeltaEur: row.Alternative_Price_Delta_EUR,
    altPriceSavingEur: row.Alt_Price_Saving_EUR,
    altCo2SavingKg: row.Alt_CO2_Saving_Kg,
    altGreenerPct: row.Alt_Greener_Pct,
    makeScore: row.Make_Score,
    lastScore: row.Last_Score
  };
  const curatedAlternative = curatedAlternatives.get(product.id);

  return curatedAlternative ? { ...product, curatedAlternative } : product;
}

export function getProducts(): Product[] {
  const filePath = path.join(process.cwd(), "bol_products_scored.csv");
  const csv = fs.readFileSync(filePath, "utf8");
  const curatedAlternatives = loadCuratedAlternatives();

  return parseCsv(csv)
    .filter((row) => row.Category !== "Food & Beverage")
    .map((row) => mapRow(row, curatedAlternatives));
}

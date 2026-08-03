> ⚠️ **SUPERSEDED — early draft, do NOT implement from this.** The final, current source of truth is
> **`FRONTEND_AND_LOGIC.md`**. This v1 differs from what shipped (it says geometric mean → final uses a
> weighted arithmetic blend; it says `products.json` → final ships `bol_products_scored.csv`). Kept only
> for the strategic/“what others do” reasoning.

# Bol Sustainability Layer — Scoring Spec (v1)

**Track 2 ("The Brain"): scoring + AI.** Turn messy, half-missing data into one honest, glanceable score that admits its own uncertainty — and quietly catches a fib.

The whole system produces **four shopper-visible outputs** from one pipeline:

1. **Leaves (1–5)** — pure sustainability, glanceable next to the price.
2. **Confidence meter** — how much real (non-imputed) data backs those leaves = our EU/DPP-readiness number.
3. **Bol Verified ✓** — a self-reported eco claim that our independent score corroborates.
4. **Greener-alternative nudge** — "save X kg CO₂ & €Y by picking this instead."

A fifth output, the **honesty/greenwashing detector**, runs *internally only* — it never touches the shopper's leaves; it surfaces in the demo + a seller-facing nudge.

---

## 1. The leaf score = a mini lifecycle (Make / Move / Pack / Last)

Four pillars, each a distinct lifecycle stage so **no carbon is counted twice**. (Verified empirically: `corr(shipping distance, CO2_Footprint_kg) = 0.12` and Digital Goods = 0 CO₂ → the CO₂ field is *manufacturing/embodied only*, so transport is an independent axis.)

| Pillar | Stage | Inputs | Direction |
|---|---|---|---|
| **Make** | manufacturing | `CO2_Footprint_kg` | lower = better |
| **Move** | logistics in | `Country_Of_Origin` → distance-to-NL + delivery promise | nearer / slower = better |
| **Pack** | packaging | `Packaging_Type` + warehouse fit-to-size/no-tape bonus | recyclable/minimal = better |
| **Last** | use + end-of-life | `Repairability_Score`, `Estimated_Lifespan_Years`, `Material_Recyclable_Pct` | longer/repairable/recyclable = better |

**Pitch line:** *"Our score follows the product's life — Make, Move, Pack, Last — so nothing is double-counted."*

### Pack pillar — warehouse bonus
BFC1, BFC-XL, BFC-XL2 do **fit-to-size, glue-not-tape** packing → packaging bonus. BFC2 and INGRAM (Ingram Micro, third-party) do not. This lever is 100% populated, so it's our most reliable signal.

```
packaging_base = score_of(Packaging_Type)   # Biodegradable/Minimal/Digital high; Foam+Plastic/Plastic low
if WarehouseCode in {BFC1, BFCXL, BFCXL2}: packaging_base += fit_to_size_bonus  # e.g. +10, capped at 100
```

### Move pillar — distance + delivery
`distance_to_NL` from a hardcoded country→km lookup (build artifact, §6). Delivery uses a **neutral baseline (normal delivery)** so products are comparable in a listing. The delivery *choice* only changes the score **live** when the shopper toggles same-day (§5d).

---

## 2. Normalization (the most important methodological choice)

Each pillar's raw value → **0–100 percentile within its Category**. A treadmill's CO₂ vs a digital planner's is meaningless raw; percentile-in-category makes pillars fair and gives the explainable line *"greener than 80% of comparable yoga gear."*

- Granularity: **Category** (10 categories have enough rows). Use **Subcategory** when n ≥ 15, else fall back to Category.
- Carbon and any "lower-is-better" field: invert the percentile.

---

## 3. Missing data: impute + show confidence

52% of recyclability, 49% of lifespan, 41% of repairability, 26% of CO₂ are blank. Don't drop the product, and don't pretend the gap isn't there.

- **Impute:** fill a missing pillar input with the **subcategory median** (fall back to category median). Mark `is_estimated = true`.
- **Confidence** = (count of *real*, non-imputed required fields) ÷ (total required fields).
- This is the **same number** as the **EU / DPP-readiness** score (§4) — one mechanism, three uses: confidence dots, EU compliance score, seller nudge.

**UI:** badge opacity / dot-fill scales with confidence. A low-confidence 4-leaf reads as "4 leaves — but we only had 2 of 6 data points."

---

## 4. Aggregation → leaves

```
composite = weighted_geometric_mean(Make, Move, Pack, Last,
                                     weights = {Make:.35, Move:.20, Pack:.20, Last:.25})
```

**Geometric** mean (not arithmetic): a catastrophic pillar can't be offset by a great one — air-freight-from-China is not cancelled by recyclable packaging. Good methodology *and* a good stage line.

**Leaf mapping (category-relative):** composite 0–100 → fixed bands `[0–20)=1 … [80–100]=5`. Because pillars are category-normalized, **5 leaves = best-in-category**, not an absolute footprint. (This is why a SaaS subscription never out-leaves a toothbrush — you never compare across categories.)

**EU compliance / DPP-readiness** (separate from leaves — documentation ≠ greenness): % of the 5 ESPR-required disclosures present —
`CO2_Footprint_kg`, `Material_Recyclable_Pct`, `Repairability_Score|Lifespan`, `Country_Of_Origin`, `Eco_Label`.
Backed by real EU instruments (ESPR/DPP, EU Ecolabel, Green Claims Directive).

---

## 5. The four shopper outputs + the internal detector

### a) Leaves (1–5) — §1–4. Never modified by honesty.

### b) Bol Verified ✓ — reward-only, no penalties
| Case | Result |
|---|---|
| cert/label present (`Eco_Label` or `Carbon_Neutral_Certified=TRUE`) **AND** composite ≥ category median | **Verified ✓** |
| label present but composite < median (disagrees) | no badge, **no penalty** |
| no label | no badge, **no penalty** |

Guardrail: Verified requires **agreement**, not mere existence — otherwise we'd verify the `Cradle-to-Cradle + plastic + 168 kg` greenwashers (the Amazon Climate Pledge failure mode). Absence of a badge is the only — and quiet — signal.

### c) Greener-alternative nudge
Within same Subcategory: pick the product with higher composite **and** confidence ≥ current. Show CO₂ delta (kg) + price delta (€). LLM writes the one-liner.

### d) Delivery toggle (live)
Displayed leaves assume normal delivery. When shopper selects same-day, Move pillar drops and leaves update live: *"Same-day drops this 4★→3★ — pick next-day to keep it green."* Nudge, don't block. (Second wow moment.)

### e) Honesty detector — INTERNAL ONLY (demo + seller view)
Deterministic rule layer (robust, can't hallucinate on stage); LLM narrates a fired rule into one sentence. Claim signals = `Eco_Label`, `Carbon_Neutral_Certified`, `Category == "Eco-Friendly"` (no name-parsing needed; optional 15-word keyword list as bonus). Rules:
- claims recyclable **AND** `Material_Recyclable_Pct < 30`
- `Carbon_Neutral_Certified=TRUE` **AND** CO₂ in top category quartile
- eco-label/Eco-Friendly **AND** far origin **AND** high CO₂  ← the "flown across the planet" line
- any eco-label **AND** `Packaging_Type ∈ {Plastic, Foam+Plastic}`

Scripted hero row: **`Nano Phone Accessories Speaker`** — Cradle-to-Cradle, Plastic, CO₂ 168.83.
The shopper storefront shows none of this; it powers the judge-facing demo and a "fix-before-Green-Claims-Directive" seller nudge.

---

## 6. Where AI runs (Track 2 = scoring + AI, not a bolted-on chatbot)

All LLM outputs **pre-computed at build time and cached into `products.json`** (demo never depends on a live call):
1. **Missing-value imputation** — estimate absent fields from category + origin, return `{value, confidence, rationale}`, flagged as estimate.
2. **Score explanation** — the "why this score" sentence from the pillar breakdown.
3. **Greenwashing narrator** — turns a fired rule into one plain-language call-out.
4. **Greener-alternative reasoning** — picks + justifies the better same-subcategory product.

---

## 7. Edge cases & build artifacts

- **Digital Goods** (CO₂=0, no pack/ship/durability): tag **"Digital — minimal footprint,"** don't force into physical leaf ranking.
- **Food & Beverage** (2 rows): exclude from demo set (can't normalize).
- **Build artifact:** hardcoded `country → distance-to-NL (km)` lookup for the Move pillar.
- **Output:** one static `products.json` (score + 4 pillars + confidence + flags + verified + alt-id + cached LLM text per product). React+Vite reads it directly.

---

## 8. Architecture & build order

```
CSV ──[Python build script]──► products.json ──► React+Vite (3 components)
        (normalize, impute, score,                ProductBadge / ComparisonView / GreenwashCallout-[demo only])
         rules, cache LLM outputs)
```

1. **Pipeline (no LLM):** CSV → composite + pillars + confidence. Unblocks everyone.
2. **Frontend:** Vite scaffold + 3 components against mock JSON.
3. **Pipeline +rules +cached LLM:** honesty flags, imputation, narration into JSON.
4. **Hero script:** rehearse 3-min walkthrough on the Nano Speaker + delivery-toggle moments.
5. **"Next month" slide:** seller DPP-readiness dashboard (mechanism already built — just mock it).

---

## 9. Judging-criteria map

| Criterion | Wt | Covered by |
|---|---|---|
| Real person gets it | 25% | one badge + one sentence; leaves by price |
| Did you surprise us | 20% | live greenwashing call-out + delivery-toggle |
| Thinking sound | 20% | category-normalized, geometric mean, confidence first-class, CO₂-is-Make proven |
| Actually runs | 20% | deterministic rules + pre-cached LLM → can't break live |
| Bol could ship it | 15% | DPP-readiness ties to real EU law Bol faces anyway |

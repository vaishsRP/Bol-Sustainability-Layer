# Bol Sustainability Layer — Implementation Handover

For the engineer/agent (Codex) building the Vercel frontend. This is the single source of truth:
the data contract, every UI surface, every component, the rules you must not break, and the
known gaps. If something here is ambiguous or missing, **flag it — do not invent a number.**

Data file: `bol_products_scored.csv` (1,000 rows, 46 columns). Optional override:
`curated_alternatives.json`. Scores were produced by `build_scores.py`.

---

## 0. The one-paragraph mental model
Every product gets ONE explainable sustainability score (`Final_Sustainability_Score`, 0–100,
shown as 1–5 leaves). Around it sit *trust & action* signals — confidence, a "Bol Certified"
badge, a greener-alternative nudge, a delivery nudge. The score answers "how green"; everything
else sits **beside** it, never inside it. The layer is glanceable and expandable on demand — it
must **not** take over the shopping experience.

---

## 1. HARD RULES (do / don't) — these are the whole point, don't violate them

**DO**
- Always make the score **explainable on tap** (the "why this score" breakdown). A bare score with
  no explanation is a legal liability in the EU (the Green Claims Directive; Zalando was forced to
  delete its unexplained leaf icons). Explainability is non-negotiable.
- Lead with **win-win, never guilt**: "greener AND cheaper" beats any moral message (only ~14% of
  shoppers pay a green premium).
- Make the **delivery nudge prominent** (it's the highest-converting sustainability lever).
- Keep it a **layer**: one glanceable badge that expands. Normal shopping must work untouched.

**DON'T**
- ❌ Never show `Claim_Risk_Flag` / `Claim_Risk_Reason` to the shopper (no shaming third-party
  sellers in the storefront). Those are for the **demo / internal "Bol Trust" view only**.
- ❌ Never show raw `kg CO₂`, `Alt_Greener_Pct`, or any sub-score number as the headline to the
  shopper — use leaves + the composed nudge string. (% can exceed 100; kg tests poorly.)
- ❌ Never let popularity (`units_sold`, `revenue`) influence anything shown as greenness.
- ❌ Never let a certificate alone inflate the leaf score (cert → the badge, not the number).
- ❌ Don't surface Digital Goods in the sustainability sort (they'd dominate at ~93). Don't show
  Food & Beverage in the demo set (only 2 rows, not scored meaningfully).

---

## 2. Data contract — all 46 columns

### 2a. Original product fields (23) — display as-is
| Column | Type | Use |
|---|---|---|
| `Product_ID` | string `PROD-2025-0001` | key; links greener alternative |
| `Product_Name` | string | title |
| `Category` / `Subcategory` | string | grouping; Subcategory = alternative matching key |
| `Estimated_Total_Units_Sold_in_2025` | int | **do not show as greenness**; reserved for impact lens |
| `Estimated_Revenue_in_2025_USD` | float | unused in UI |
| `Price_From_EUR` / `Price_To_EUR` | float | price range; show midpoint or range |
| `WarehouseName`/`Code`/`GLN`/`Address` | string | internal; Code drives infra score |
| `IsSameDayAvailable` / `IsNextDayAvailable` / `IsNormalDeliveryAvailable` | `TRUE`/`FALSE` | delivery options offered |
| `Country_Of_Origin` | string (may be blank) | origin; "made in" line |
| `CO2_Footprint_kg` | float (may be blank) | manufacturing footprint; product-page detail only |
| `Packaging_Type` | string (may be blank) | packaging detail |
| `Repairability_Score` | 1–9 (may be blank) | durability detail |
| `Estimated_Lifespan_Years` | float (may be blank) | durability detail |
| `Material_Recyclable_Pct` | 0–100 (may be blank) | recyclability detail |
| `Eco_Label` | string (mostly blank) | the seller's claimed certificate |
| `Carbon_Neutral_Certified` | `TRUE`/`FALSE`/blank | claimed carbon-neutral |

### 2b. Computed fields (23)
| Column | Type | Meaning / display |
|---|---|---|
| `Packaging_Score` | 0–100 | pillar input — product page breakdown bar |
| `Material_Type_Score` | 0–100 | pillar input — breakdown bar |
| `Warehouse_Infra_Score` | 0–100 | pillar input (BFC fit-to-size) — breakdown bar |
| `Sub_Score_1` | 0–100 | "Packaging & Materials" sub-index |
| `Transport_Score` | 0–100 | "Move" pillar — breakdown bar |
| `Logistics_Plausibility_Score` | 0–100 | internal data-sanity; **don't show** |
| `Seller_Honesty_Score` | `TRUE`/`FALSE` | internal/demo; **don't show to shopper** |
| `Sub_Score_2` | 0–100 | "Transport & logistics" sub-index |
| `Final_Sustainability_Score` | 0–100 | **THE score** → render as leaves (see §3) |
| `Confidence_Level` | `High`/`Medium`/`Low` | data completeness → confidence indicator (§5) |
| `Missing_Data_Gaps` | `"None"` or `"a; b"` | what's missing — optional "we're missing X" line |
| `Claim_Risk_Flag` | `TRUE`/`FALSE` | **DEMO/INTERNAL ONLY** — never in storefront |
| `Claim_Risk_Reason` | sentence or blank | **DEMO/INTERNAL ONLY** — the greenwashing call-out |
| `Recommended_Delivery_Date` | `Today`/`Next day`/`Standard` | the greenest delivery option label (NOT a date) |
| `Delivery_Improvement_Percent` | 0–45 int | CO₂ % saved by the green option; show nudge only if >0 |
| `Greener_Alternative_Product_ID` | `PROD-…` or blank | the auto-matched greener product |
| `Bol_Certified` | `TRUE`/`FALSE` | the positive trust badge (§5) |
| `Eco_Label_Scope` | string or blank | what the label certifies (tooltip on the cert) |
| `Price_Sustainability_Score` | 0–100 | "green per euro"; optional sort key |
| `Alternative_Price_Delta_EUR` | float or blank | alt price − this price (negative = cheaper); raw |
| `Alt_Price_Saving_EUR` | float or blank | € the greener pick saves (>0 only when cheaper). **Sum across the basket at checkout.** |
| `Alt_CO2_Saving_Kg` | number or blank | kg CO₂ saved by switching (blank = unknown → treat as 0). **Sum across the basket at checkout.** |
| `Alt_Greener_Pct` | int or blank | relative; internal — **don't show raw** (can exceed 100) |
| `Make_Score` | 0–100 | **Make** pillar (CO₂). Use for the "Make" breakdown bar (NOT materialTypeScore). |
| `Last_Score` | 0–100 | **Last** pillar (durability). Use for the "Last" breakdown bar (was empty). |

---

## 3. The leaf score (how to render `Final_Sustainability_Score`)
- **Leaves = `max(1, round(Final / 20))`** → 1–5 leaves. Optionally show the number on tap.
- Leaves are **category-relative** ("greener than others of its kind"), not absolute — phrase any
  tooltip as "compared to similar products."
- **Fade the leaves by confidence** (see §5): Low confidence → muted/outline leaves + a note.
- Digital Goods: show "Digital — minimal footprint" instead of competing leaves; exclude from sort.

---

## 4. Surfaces — what each shows

### 4.1 Search / listing card (glanceable)
- Leaf score (tappable) · confidence dot · `Bol_Certified` badge (only if TRUE) · price.
- That's it. No breakdown, no claims, no kg/%. The leaf must be tappable to the product page.

### 4.2 Product detail page (expandable detail)
Order top→bottom:
1. Leaf score + confidence indicator + Bol Certified badge.
2. **One-line "why this score"** (plain language, e.g. "Greener than 80% of similar items —
   recyclable packaging, made nearby, built to last"). Builds trust (research: 83.7%).
3. **Breakdown bars** — Make=`Make_Score` (CO₂) · Move=`Sub_Score_2` (or `Transport_Score`) ·
   Pack=`Sub_Score_1` · Last=`Last_Score`. Tap each for the raw fact (CO₂, origin, packaging, lifespan).
   Do NOT use `Material_Type_Score` for "Make", and `Last` must use `Last_Score` (not blank).
4. **What the certificate means** — `Eco_Label` + `Eco_Label_Scope` tooltip (only if labelled).
5. **Delivery nudge** (§4.4).
6. **Greener alternative** card (§4.3) if `Greener_Alternative_Product_ID` is set.

### 4.3 Comparison view (THE HERO FLOW)
Two similar products side by side:
- Both leaf scores + confidence + Bol Certified.
- **Footprint comparison bar** (most persuasive per research): show both `CO2_Footprint_kg`
  values as a mini bar ("This: 190 kg → Greener: 51 kg CO₂"). Hide if either is blank.
- **Per-product:** show the greener pick + a simple chip "€X cheaper" (from `Alt_Price_Saving_EUR`)
  and a green "greener" tag. **No trip-equivalence here** — that's reserved for checkout (§4.4b).
- For hero products, check `curated_alternatives.json` FIRST (§8).

### 4.4 Delivery nudge — what "greenest option" means (plain version)
On bol you pick a delivery speed: **Today / Next day / Standard**. Faster delivery is usually
*dirtier* — a rush parcel may go on its own near-empty trip; slower parcels get consolidated onto
fuller trucks. So we **highlight one option as the greenest** to nudge the shopper toward it.
- `Recommended_Delivery_Date` = the option we tag green (Today / Next day / Standard). **Show just a
  "Greenest" badge on that option — no percentage.**
- `Delivery_Improvement_Percent` is intentionally **blank** (we removed the fake %). The tag is the
  whole nudge: "this option is the greenest."
- **DEMO CAVEAT:** which option is greenest is currently *illustrative* (we don't have shipment
  data). **Future scope:** the greenest is the option tied to a van **already going out** — if a
  truck leaves the NL warehouse today anyway, "Today" is the greenest, not the slowest. That ties
  the green tag to **real transport logistics**, not a guess. Say this on stage; keep the nudge gentle.

### 4.4b Checkout — the aggregate "you saved" moment (the dramatic one)
Per-product savings are small; **summed across the basket they get dramatic.** At checkout:
1. **Sum** `Alt_Price_Saving_EUR` and `Alt_CO2_Saving_Kg` over the basket items (blank = 0).
2. **Map the total CO₂ to a trip from Amsterdam** using the ladder below (pick the largest trip
   whose CO₂ ≤ the total — never overclaim).
3. Render one line:
   > **"You saved €{total_eur} and {total_co2} kg of CO₂ — that's the equivalent of {trip}."**
   e.g. *"You saved €34 and 180 kg of CO₂ — the equivalent of a short flight to London."*

**The trip ladder** (each value = that trip's real CO₂; pick largest ≤ total):
| Total CO₂ saved | Equivalent |
|---|---|
| ≥ 3 kg | a drive across Amsterdam |
| ≥ 7 | a drive to Utrecht |
| ≥ 13 | a drive to Rotterdam |
| ≥ 36 | a drive to Brussels |
| ≥ 85 | a drive to Paris |
| ≥ 112 | a drive to Berlin |
| ≥ 150 | a short flight to London |
| ≥ 270 | a flight to Barcelona |
| ≥ 1000 | a long-haul flight to New York |

**Basis (cite if asked):** car ≈ **0.17 kg CO₂/km** (DEFRA 2024 average car); drives = Amsterdam
road distance × 0.17; flights = standard per-passenger economy estimates (DEFRA/ICAO). Flying is
dirtier per km, so **a short flight outranks a long drive** — an honest, memorable beat. No live
API; this is a curated table (a production version would use a maps distance API × DEFRA factors).
*Connecting to "actual transport":* the end location (a real city) and mode (drive vs flight) are
the concrete anchor; future scope can personalise it to the shopper's own location/delivery address.

### 4.5 Demo / internal "Bol Trust" view (NOT the storefront)
- This is where `Claim_Risk_Flag` + `Claim_Risk_Reason` live — the greenwashing call-out for the
  3-minute demo. A separate page/toggle, clearly framed as internal/seller-facing. Never on a
  shopper-facing card or product page.

---

## 5. Component specs (rules)
- **Confidence indicator:** High → solid; Medium → half; Low → outline + "based on limited data."
  Never hide a Low score — fading it *is* the honesty feature.
- **Bol Certified badge:** show only when `Bol_Certified == TRUE` (42 products). It already
  guarantees High confidence + a real environmental cert + no contradiction. No extra logic needed.
- **Greener-alternative card:** product name + image + price + the two nudge chips. Only render if
  `Greener_Alternative_Product_ID` is non-blank. If the nudge is just "Greener pick" (no € or CO₂
  edge), render it small/secondary — it's a weak case.
- **Eco-label tooltip:** show `Eco_Label_Scope` so the label means something (e.g. "Fair Trade =
  social/ethical, not environmental").

---

## 6. Interaction rules
- **Default sort "Sustainability: high→low":** sort by `Final_Sustainability_Score` **excluding
  `Category == "Digital Goods"`** (filter them out or bucket them separately).
- **Tap leaf → product page** breakdown.
- **Delivery toggle:** if you implement live re-scoring when the user picks a faster option, the
  effect is illustrative (we don't have a per-option score in the CSV) — animate a small drop and
  show the % from `Delivery_Improvement_Percent`. Don't claim precision.

---

## 7. Microcopy & framing rules
- Headline greenness = **leaves**, never kg or %.
- **Per-product** savings = just "€X cheaper" (`Alt_Price_Saving_EUR`). Keep it small.
- **Checkout** savings = the aggregate line (§4.4b): "You saved €X and Y kg CO₂ — equivalent of {trip}."
  This is the only place the trip-equivalence appears (summed = dramatic). Render `EUR`→`€`.
- Never use the word "sustainable/eco/green" as a *bare claim* without the explanation behind it.
- Tone: helpful, factual, no guilt. "You could pick this — greener and cheaper" not "stop buying this."

---

## 8. `curated_alternatives.json` (demo polish)
- Keyed by `Product_ID`. For a viewed product, **look here first**; if found, render that curated
  alternative (real bol.com substitute with name/URL/price); else fall back to
  `Greener_Alternative_Product_ID`.
- Currently seeded for the hero products (Nano Speaker → House of Marley speaker; Full Body Shaver
  → Bambaw safety razor; + a refurbished Foreo). **Verify the prices/links before the live demo.**
- Demo line: "today we auto-match greener options by category; here's where it's going —
  true product-level matches pulled from bol.com."

---

## 9. KNOWN GAPS / ASSUMPTIONS — flag, don't paper over
- **Delivery greenest is randomised** (stable per product) — placeholder pending real shipment
  logistics. Frame as future scope; don't present as precise.
- **Curated alternative prices/URLs** are illustrative — confirm before demo.
- **Delivery footprint weights** (same 1.0 / next 0.5 / normal 0.2) are assumptions.
- **`Alt_Greener_Pct` can exceed 100** — never display raw; it only informs the nudge.
- **Material recyclability barely moves the score** (52% of it is imputed) — surfaced honestly via
  confidence; don't over-claim recyclability in copy.
- **Greener alternative matches by subcategory + name keyword** — usually a real substitute, not
  guaranteed. The curated overrides exist for exactly the hero cases where it matters.
- **Plausibility leaks ~5% into Final** — accepted, minor.
- If any column you need is blank for a product, **degrade gracefully** (hide that element) — never
  fabricate a value.

---

## 10. Demo hero alignment (so the build matches the script)
- **Greenwashing wow:** `PROD-2025-0138` Nano Phone Accessories Speaker — Cradle-to-Cradle label,
  plastic, flown from Japan, 168 kg. In the **Trust view**, `Claim_Risk_Reason` fires.
- **Win-win + checkout aggregate:** build a basket of a few items that each have a greener pick,
  then show the checkout line "You saved €X and Y kg CO₂ — equivalent of a short flight to London."
- **Confidence honesty:** show a Low-confidence product with faded leaves + "based on limited data."
- **Delivery:** show a product where `Delivery_Improvement_Percent > 0` and toggle the green option.

---

## APPENDIX — the scoring logic (for reference / Q&A)

Pillars (each 0–100, category-percentile where noted):
```
Make = CO2 (category percentile, inverted)            Pack = Sub_Score_1
Move = Sub_Score_2                                     Last = durability (repairability + lifespan pct)
Sub_Score_1 = 0.35·Packaging + 0.30·Material + 0.35·Warehouse
Sub_Score_2 = 0.65·Transport + 0.35·Plausibility
Final = 0.35·Make + 0.25·Sub_Score_1 + 0.15·Sub_Score_2 + 0.25·Last
```
- CO₂ proven manufacturing-only (distance↔CO₂ corr = 0.12) → Make and Move don't double-count.
- Weights: CO₂ highest, per EU PEF (climate ≈ 21%, the largest single category).
- Confidence weighted by how much each field drives the score (CO₂ heaviest).
- Honesty (`Seller_Honesty_Score`, `Claim_Risk_*`) feeds **nothing** in the score — reward-only.
- `Bol_Certified` = High confidence + environmental cert (Fair Trade excluded) + no contradiction.

# bolhack

Hackathon project for the bol.com sustainability case, June 2026.
Team Ctrl+V, two people. We called it The Honest Price Tag.

live demo: https://bol-com-solution.vercel.app/
ps: it runs on a free vercel account so it may be slow to wake up.

The case gave us a catalog of 1,000 products where the sustainability
fields are half empty and sometimes contradict each other. The example
that shaped the whole project: a phone speaker in the set carries a
Cradle to Cradle certificate, and the data under that certificate shows
plastic packaging, shipping from Japan, and 168 kg of CO2 to
manufacture. The certificate is real. The product is still a bad pick.
We built a layer that scores what the data says instead of what the
label claims.

## what it does

Every product gets one score from 0 to 100, shown as 1 to 5 leaves next
to the price. Around the score sit a confidence level (how much real
data backs it), a plain language reason you can expand, a greener
alternative from the same subcategory, and a delivery nudge. A separate
rule layer checks whether a product's eco claim matches its own data.
That layer never changes the score. It only powers an internal seller
facing view.

## how the score works

Four pillars, one per stage of the product's life, so the same carbon
is never counted twice:

1. Make: manufacturing CO2
2. Pack: packaging type, recyclable material share, and warehouse
   (BFC warehouses pack fit to size without tape, and the warehouse
   field is filled for every row, so it was the most reliable signal
   we had)
3. Move: shipping distance from the origin country, plus a small data
   consistency check
4. Last: repairability and expected lifespan

```
Final = 0.35 Make + 0.25 Pack + 0.15 Move + 0.25 Last
```

Raw values become percentiles within the product's category before any
scoring. Comparing a treadmill's CO2 to a phone case's tells you
nothing, so 5 leaves means best within its category. The score never
claims a product is green in absolute terms.

Before splitting Make and Move into separate pillars we checked that
the CO2 field covers manufacturing only: correlation between shipping
distance and CO2 in the catalog is 0.12, and digital goods sit at 0 kg.

## missing data

About half the catalog has no recyclability or lifespan value and a
quarter has no CO2 value. Missing inputs get filled with the
subcategory median (category median when the subcategory is too small),
and every product gets a High, Medium or Low confidence level, weighted
by how much each absent field would have moved the score. The frontend
fades the leaves on low confidence and says "based on limited data"
instead of hiding the product.

## the greenwashing check

A deterministic rule layer. Example rules:

- carbon neutral certified while CO2 sits in the top quartile of its
  category
- an eco label on a product packaged in plastic or foam
- an eco claim on a product with under 30 percent recyclable material

A flagged product keeps its score and its leaves. The flag only appears
in the internal trust view we used for the demo, because the point is
to help sellers fix their data before the EU Green Claims rules bite,
and a public wall of shame helps nobody.

There is also a positive badge: a product gets Bol Certified when it
has High confidence, no fired flag, and either a real environmental
certificate or at least 50 percent recyclable material. Fair Trade
counts as a social label here and does not qualify on its own.

## the nudges

Greener alternative: same subcategory, scores at least 5 points higher,
backed by at least as much real data. The matcher prefers the same
product type and a cheaper price. Cheaper matters because only about
14 percent of shoppers pay a green premium, so the pitch was always
"greener and cheaper" where the data allowed it, which turned out to be
most of the time. `curated_alternatives.json` overrides the picks for
the demo products with real bol.com substitutes.

Checkout: per product savings look tiny, so checkout sums the euro and
CO2 savings across the basket and maps the total to a real trip from
Amsterdam, using DEFRA car and flight figures. 180 kg reads as a short
flight to London. The table always picks the largest trip that fits, so
it never overclaims.

Delivery: one delivery option per product gets a "greenest" tag. In the
demo the tagged option is stable per product but random, because we had
no shipment data. The version we pitched ties the tag to a shipment
that already leaves the warehouse that day.

## what popularity does not touch

Units sold and revenue are in the data and deliberately not in the
score. A bestseller does not get greener by selling well. We kept those
columns aside for a possible impact view later: units times CO2 per
unit shows where a switch would save the most, which is a question for
bol rather than the shopper.

## what's in the repo

- `build_scores.py`: the whole scoring pipeline, python standard
  library only. Reads `bol_products_with_logistics.csv` (23 columns)
  and writes `bol_products_scored.csv` (48 columns).
- `frontend/`: the Next.js storefront demo. Reads its own copy of the
  scored csv.
- `docs/FRONTEND_AND_LOGIC.md`: the data contract and every UI rule
  the frontend was built from. The most complete description of the
  system.
- `docs/SCORING_SPEC.md`: early draft of the scoring design.
  Superseded in places, kept for the reasoning.
- `docs/SPEAKING_SCRIPT.md`: the talk script from the pitch.
- `build_deck.py`: generates the pitch deck with python-pptx.
- `Bol_Sustainability_Layer_Pitch.pptx`: the deck we presented.
- `curated_alternatives.json`: hand picked alternatives for the demo
  products.

## running it

The pipeline needs python 3.10+ and nothing else:

```
python build_scores.py
```

It writes `bol_products_scored.csv` next to the script. The frontend
keeps its own copy, so copy the file into `frontend/` if you rerun the
pipeline.

The frontend needs node 20+:

```
cd frontend
npm install
npm run dev
```

It opens at http://localhost:3000.

The deck:

```
pip install python-pptx
python build_deck.py
```

## limitations

- Hackathon dataset, so treat every number as illustrative. The
  pipeline logic is real, the CO2 values it runs on are not audited.
- Country of origin to distance is a hardcoded lookup table.
- The greenest delivery tag is a placeholder, as explained above.
- Material recyclability barely moves the score because half of it is
  imputed. The confidence level carries that honesty, the copy should
  not overclaim recyclability.
- The greener alternative is matched by subcategory and shared name
  words. It is usually a real substitute and sometimes a loose one,
  which is why the curated overrides exist for the demo products.
- Digital goods and food are excluded from leaf rankings. Digital would
  sit at the top of every sort, and food has 2 rows.

## credits

Team Ctrl+V: me and Priyanshi Dhillon. During the event the frontend
lived at https://github.com/PriyanshiDhillon/Bol.com-Solution and the
demo deployed from there. This repo is the complete cleaned up project.

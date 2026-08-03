# Bol Sustainability Layer - scoring pipeline (v2)
# Reads bol_products_with_logistics.csv, appends computed columns, writes bol_products_scored.csv
# Original column names/order preserved untouched.
import csv, statistics, re
from collections import defaultdict

STOP={'the','and','for','with','pro','nano','ultra','smart','portable','wireless','eco','zen',
      'aura','luxe','glow','vital','swift','flex','pure','minimalist','ergonomic','set','kit',
      'pack','organic','sustainable','reusable'}
def toks(name): return {w for w in re.findall(r'[a-z]+',name.lower()) if len(w)>2 and w not in STOP}
DELIV_LABEL={'same':'Today','next':'Next day','normal':'Standard'}  # native bol option names
# NOTE: the CO2->trip-from-Amsterdam framing now happens in the FRONTEND at checkout, on the
# AGGREGATED basket total (more dramatic). The per-product columns below are pure VALUES; Vercel
# sums Alt_Price_Saving_EUR and Alt_CO2_Saving_Kg across the basket and maps the total to a trip.
# confidence weights ~ how much each field drives the final score (CO2 highest)
CONF_W={'CO2_Footprint_kg':0.30,'__durability__':0.20,'Country_Of_Origin':0.15,
        'Material_Recyclable_Pct':0.12,'Packaging_Type':0.10,'Eco_Label':0.13}

SRC = 'bol_products_with_logistics.csv'
OUT = 'bol_products_scored.csv'
BASE_DATE = (2026, 6, 21)

rows = list(csv.DictReader(open(SRC, encoding='utf-8-sig')))

def num(r, c):
    v = r[c].strip()
    try: return float(v) if v != '' else None
    except: return None
def is_true(r, c): return r[c].strip().upper() == 'TRUE'

# ---------- lookups ----------
DIST = {'Netherlands':100,'Germany':400,'France':500,'UK':500,'Belgium':150,'Italy':1300,
        'Poland':1100,'Portugal':1900,'Denmark':700,'Sweden':1300,'Turkey':2500,'China':8000,
        'USA':7500,'South Korea':8500,'Japan':9000,'Taiwan':9700,'India':7000,'Bangladesh':7500}
PKG = {'Digital - No Packaging':100,'Biodegradable':90,'Minimal Packaging':80,
       'Recyclable Cardboard':70,'Mixed Plastic+Cardboard':45,'Plastic':25,'Foam + Plastic':10}
WH = {'BFCXL':100,'BFCXL2':100,'BFC1':85,'BFC2':55,'INGRAM':30}
DELIV_FOOTPRINT = {'same':1.0,'next':0.5,'normal':0.2}
DELIV_OFFSET = {'same':0,'next':1,'normal':4}
# eco-label scope + which labels are environmental (eligible for Bol Certified)
LABEL_SCOPE = {'EU Ecolabel':'Lifecycle (broad environmental)','Cradle to Cradle':'Material circularity',
               'Energy Star':'Energy efficiency','FSC Certified':'Sustainable forestry',
               'Fair Trade':'Social / ethical (not environmental)'}
ENV_LABELS = {'EU Ecolabel','Cradle to Cradle','Energy Star','FSC Certified'}  # Fair Trade excluded (social)

# ---------- category distributions for percentile normalization ----------
def pct_tables(field):
    t = defaultdict(list)
    for r in rows:
        v = num(r, field)
        if v is not None: t[r['Category']].append(v)
    for k in t: t[k].sort()
    return t
co2_tab  = pct_tables('CO2_Footprint_kg')
life_tab = pct_tables('Estimated_Lifespan_Years')
dist_tab = defaultdict(list)               # distance distribution per category (known origins)
for r in rows:
    o = r['Country_Of_Origin'].strip()
    if o in DIST: dist_tab[r['Category']].append(DIST[o])
for k in dist_tab: dist_tab[k].sort()

def percentile_score(val, sorted_vals, invert=False):
    if not sorted_vals: return 50.0
    below = sum(1 for x in sorted_vals if x <= val)
    p = 100.0 * below / len(sorted_vals)
    return 100.0 - p if invert else p
def cat_median(field, cat):
    vals = [num(r, field) for r in rows if r['Category']==cat and num(r, field) is not None]
    return statistics.median(vals) if vals else None
def sub_or_cat_median(field, r):
    vals = [num(x, field) for x in rows if x['Subcategory']==r['Subcategory'] and num(x, field) is not None]
    return statistics.median(vals) if len(vals)>=15 else cat_median(field, r['Category'])
def cat_median_dist(cat):
    return statistics.median(dist_tab[cat]) if dist_tab[cat] else 4000

CONF_FIELDS = ['CO2_Footprint_kg','Material_Recyclable_Pct','__durability__',
               'Country_Of_Origin','Packaging_Type','Eco_Label']

# ---------- pass 1: pillar scores ----------
for r in rows:
    cat = r['Category']; gaps = []; digital = (cat=='Digital Goods')

    # Make: CO2 category percentile (inverted: low CO2 -> high)
    co2 = num(r,'CO2_Footprint_kg')
    if co2 is None:
        gaps.append('CO2_Footprint_kg'); co2_use = cat_median('CO2_Footprint_kg',cat) or 42.0
    else: co2_use = co2
    make = 100.0 if digital else percentile_score(co2_use, co2_tab[cat], invert=True)

    # Pack
    pkg = r['Packaging_Type'].strip()
    if pkg=='':
        gaps.append('Packaging_Type')
        known=[PKG[x['Packaging_Type'].strip()] for x in rows if x['Category']==cat and x['Packaging_Type'].strip() in PKG]
        packaging_score = statistics.median(known) if known else 45.0
    else: packaging_score = PKG.get(pkg,45.0)

    # Material
    mat = num(r,'Material_Recyclable_Pct')
    if mat is None:
        gaps.append('Material_Recyclable_Pct'); material_score = sub_or_cat_median('Material_Recyclable_Pct',r) or 49.0
    else: material_score = mat
    material_score = max(0.0,min(100.0,material_score))

    warehouse_score = WH.get(r['WarehouseCode'].strip(),50.0)
    # warehouse infra (BFC fit-to-size / no-tape) bumped up so the logistics lever is visible
    sub1 = 0.35*packaging_score + 0.30*material_score + 0.35*warehouse_score

    # Move: Transport = category percentile of distance (inverted: nearer -> high)
    origin = r['Country_Of_Origin'].strip()
    if origin in DIST: d = DIST[origin]
    else:
        if origin=='': gaps.append('Country_Of_Origin')
        d = cat_median_dist(cat)
    transport_score = 100.0 if digital else percentile_score(d, dist_tab[cat], invert=True)

    # Plausibility (data consistency)
    plaus = 100.0
    if origin=='': plaus -= 30
    if pkg=='': plaus -= 20
    if is_true(r,'Carbon_Neutral_Certified') and co2 is not None and co2 > (cat_median('CO2_Footprint_kg',cat) or 42): plaus -= 25
    plaus = max(0.0,plaus)
    sub2 = 0.65*transport_score + 0.35*plaus

    # Last: durability = repairability(absolute) + lifespan(category percentile)
    rep = num(r,'Repairability_Score'); life = num(r,'Estimated_Lifespan_Years')
    parts=[]
    if rep is not None: parts.append((rep-1)/8*100)
    if life is not None: parts.append(percentile_score(life, life_tab[cat], invert=False))
    if not parts:
        gaps.append('Repairability/Lifespan')
        li = sub_or_cat_median('Estimated_Lifespan_Years',r)
        parts.append(percentile_score(li, life_tab[cat]) if li is not None else 50.0)
    last = 100.0 if digital else sum(parts)/len(parts)

    final = 0.35*make + 0.25*sub1 + 0.15*sub2 + 0.25*last
    pmid = (num(r,'Price_From_EUR') + num(r,'Price_To_EUR'))/2

    r.update(_pack=packaging_score,_mat=material_score,_wh=warehouse_score,_sub1=sub1,
             _transport=transport_score,_plaus=plaus,_sub2=sub2,_last=last,_make=make,
             _final=round(final,1),_gaps=gaps,_co2=co2,_digital=digital,_d=d,_pmid=pmid,
             _value=round(final/pmid,3) if pmid>0 else 0)

    present=0; cscore=0.0
    for fld,wt in CONF_W.items():
        ok = (rep is not None or life is not None) if fld=='__durability__' else (r.get(fld,'').strip()!='')
        if ok: present+=1; cscore+=wt
    r['_present']=present
    r['Confidence_Level']='High' if cscore>=0.65 else ('Medium' if cscore>=0.40 else 'Low')
    r['Missing_Data_Gaps']='; '.join(gaps) if gaps else 'None'

# ---------- value distribution per category (for Price_Sustainability_Score) ----------
val_tab=defaultdict(list)
for r in rows: val_tab[r['Category']].append(r['_value'])
for k in val_tab: val_tab[k].sort()

# ---------- pass 2: claims, honesty, certified, delivery, price-value ----------
final_by_cat=defaultdict(list)
for r in rows: final_by_cat[r['Category']].append(r['_final'])
fmed={c:statistics.median(v) for c,v in final_by_cat.items()}

for r in rows:
    cat=r['Category']
    claim = (r['Eco_Label'].strip()!='' or is_true(r,'Carbon_Neutral_Certified') or cat=='Eco-Friendly')
    reason=''; flag=False
    if claim:
        co2=r['_co2']; pkg=r['Packaging_Type'].strip(); mat=num(r,'Material_Recyclable_Pct')
        cv=sorted(co2_tab[cat]); q3=cv[int(0.75*(len(cv)-1))] if cv else None
        if is_true(r,'Carbon_Neutral_Certified') and co2 is not None and q3 is not None and co2>=q3:
            flag=True; reason='Carbon-neutral certified, but CO2 is in the top 25% for its category.'
        elif pkg in ('Plastic','Foam + Plastic'):
            flag=True; reason=f'Eco claim, but packaged in {pkg}.'
        elif mat is not None and mat<30:
            flag=True; reason=f'Eco claim, but only {int(mat)}% recyclable material.'
        elif r['_d']>=5000 and co2 is not None and co2>(cat_median('CO2_Footprint_kg',cat) or 42):
            flag=True; reason='Marketed as eco, but shipped from far away with an above-average footprint.'
        elif r['_final']<fmed[cat]:
            flag=True; reason='Carries an eco label, but scores below the category average on our independent check.'
    r['Claim_Risk_Flag']='TRUE' if flag else 'FALSE'
    r['Claim_Risk_Reason']=reason
    r['Seller_Honesty_Score']='FALSE' if flag else 'TRUE'   # binary: TRUE = honest / no contradiction

    lab=r['Eco_Label'].strip()
    r['Eco_Label_Scope']=LABEL_SCOPE.get(lab,'') if lab else ''
    # Goede Keuze (Bol's real label): qualifies via an approved cert OR >=50% recycled material.
    # We add our integrity gate: High confidence + claim not contradicted. Recycling flag done HERE (logic).
    has_env_cert = (lab in ENV_LABELS) or is_true(r,'Carbon_Neutral_Certified')
    recycled50 = (num(r,'Material_Recyclable_Pct') or 0) >= 50
    r['Bol_Certified']='TRUE' if (r['Confidence_Level']=='High' and not flag and (has_env_cert or recycled50)) else 'FALSE'

    # delivery nudge
    avail=[a for a,k in [('same','IsSameDayAvailable'),('next','IsNextDayAvailable'),('normal','IsNormalDeliveryAvailable')] if is_true(r,k)] or ['normal']
    idx=int(r['Product_ID'].split('-')[-1])
    # DEMO: greenest option tagged pseudo-randomly but STABLE per product.
    # Future scope: greenest = earliest real outbound shipment (e.g. a van already leaving the NL
    # warehouse today), derived from live shipment logistics we don't have in the sandbox.
    greenest=avail[idx % len(avail)]
    r['Recommended_Delivery_Date']=DELIV_LABEL[greenest]   # greenest option TAG (random for demo; real shipment data later)
    r['Delivery_Improvement_Percent']=''   # dropped: no fabricated %. The greenest TAG above is the whole nudge.

    # price-vs-sustainability: green-per-euro, category percentile (higher = better value)
    r['Price_Sustainability_Score']=round(percentile_score(r['_value'],val_tab[cat]),1)

# ---------- pass 3: greener alternative + price delta ----------
by_sub=defaultdict(list)
for r in rows: by_sub[r['Subcategory']].append(r)
def blank_alt(r):
    r['Greener_Alternative_Product_ID']=''; r['Alternative_Price_Delta_EUR']=''
    r['Alt_Price_Saving_EUR']=''; r['Alt_CO2_Saving_Kg']=''; r['Alt_Greener_Pct']=''
for r in rows:
    if r['_digital'] or r['Category']=='Food & Beverage':
        blank_alt(r); continue
    rt=toks(r['Product_Name'])
    cands=[x for x in by_sub[r['Subcategory']] if x['Product_ID']!=r['Product_ID']
           and x['_final']>=r['_final']+5 and x['_present']>=r['_present']]
    if not cands:
        blank_alt(r); continue
    # rank: same product-type (shared name word) > cheaper > greener
    best=max(cands,key=lambda x:(len(toks(x['Product_Name'])&rt)>0, x['_pmid']<r['_pmid'], x['_final']))
    delta=round(best['_pmid']-r['_pmid'],2)                 # negative = cheaper
    pct=round((best['_final']-r['_final'])/r['_final']*100) if r['_final']>0 else 0
    co2s = round(r['_co2']-best['_co2'],1) if (r['_co2'] is not None and best['_co2'] is not None) else None
    r['Greener_Alternative_Product_ID']=best['Product_ID']
    r['Alternative_Price_Delta_EUR']=delta                       # signed: negative = greener pick is cheaper
    r['Alt_Price_Saving_EUR']=round(max(0.0,-delta),2)           # >0 only when the greener pick is cheaper
    r['Alt_CO2_Saving_Kg']=co2s if (co2s is not None and co2s>0) else ''  # kg saved by switching (blank=unknown)
    r['Alt_Greener_Pct']=pct

# ---------- write ----------
orig_cols=list(csv.DictReader(open(SRC,encoding='utf-8-sig')).fieldnames)
new_cols=['Packaging_Score','Material_Type_Score','Warehouse_Infra_Score','Sub_Score_1',
          'Transport_Score','Logistics_Plausibility_Score','Seller_Honesty_Score','Sub_Score_2',
          'Final_Sustainability_Score','Confidence_Level','Missing_Data_Gaps','Claim_Risk_Flag',
          'Claim_Risk_Reason','Recommended_Delivery_Date','Delivery_Improvement_Percent',
          'Greener_Alternative_Product_ID','Bol_Certified','Eco_Label_Scope',
          'Price_Sustainability_Score','Alternative_Price_Delta_EUR','Alt_Price_Saving_EUR',
          'Alt_CO2_Saving_Kg','Alt_Greener_Pct','Make_Score','Last_Score']
def rnd(x): return round(float(x),1)
try:
    fh=open(OUT,'w',newline='',encoding='utf-8-sig')
except PermissionError:
    OUT='bol_products_scored_v3.csv'; fh=open(OUT,'w',newline='',encoding='utf-8-sig')
    print('NOTE: canonical file was locked (open in editor) -> wrote',OUT,'instead')
with fh as f:
    w=csv.writer(f); w.writerow(orig_cols+new_cols)
    for r in rows:
        w.writerow([r[c] for c in orig_cols]+[
            rnd(r['_pack']),rnd(r['_mat']),rnd(r['_wh']),rnd(r['_sub1']),
            rnd(r['_transport']),rnd(r['_plaus']),r['Seller_Honesty_Score'],rnd(r['_sub2']),
            r['_final'],r['Confidence_Level'],r['Missing_Data_Gaps'],r['Claim_Risk_Flag'],
            r['Claim_Risk_Reason'],r['Recommended_Delivery_Date'],r['Delivery_Improvement_Percent'],
            r['Greener_Alternative_Product_ID'],r['Bol_Certified'],r['Eco_Label_Scope'],
            r['Price_Sustainability_Score'],r['Alternative_Price_Delta_EUR'],r['Alt_Price_Saving_EUR'],
            r['Alt_CO2_Saving_Kg'],r['Alt_Greener_Pct'],rnd(r['_make']),rnd(r['_last'])])
print('wrote',OUT,'rows=',len(rows))

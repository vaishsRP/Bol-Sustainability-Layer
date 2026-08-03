"use client";

import {
  Box,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Heart,
  Leaf,
  PackageCheck,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Star,
  Trash2,
  Truck,
  X
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Product } from "@/lib/product";
import {
  confidenceTone,
  deliverySummary,
  displayValue,
  formatEuro,
  formatPrice,
  hasAlternative,
  isDigitalProduct,
  leafCount,
  parseNumber,
  productSavings,
  scoreTone
} from "@/lib/format";

type StorefrontProps = {
  products: Product[];
};

type ProductPageProps = {
  product: Product;
  products: Product[];
};

type DeliveryOptionId = "same-day" | "next-day" | "standard" | "recommended";

type DeliveryOption = {
  id: DeliveryOptionId;
  label: string;
  dateLabel: string;
  description: string;
  adjustedScore: number;
  scoreDelta: number;
  isGreenest: boolean;
};

type CartItem = {
  id: string;
  product: Product;
  deliveryOptionId: DeliveryOptionId;
  adjustedSustainabilityScore: number;
};

type SortOptionId = "sustainability-desc" | "sustainability-asc" | "price-asc" | "price-desc" | "name-asc";

const CART_STORAGE_KEY = "bol-sustainability-cart";
const CART_UPDATE_EVENT = "bol-cart-change";
const EMPTY_CATALOG: Product[] = [];
const PRODUCTS_PER_PAGE = 12;
const SORT_OPTIONS: Array<{ id: SortOptionId; label: string }> = [
  { id: "sustainability-desc", label: "Sustainability: high to low" },
  { id: "sustainability-asc", label: "Sustainability: low to high" },
  { id: "price-asc", label: "Price: low to high" },
  { id: "price-desc", label: "Price: high to low" },
  { id: "name-asc", label: "Name: A to Z" }
];
const TRIP_EQUIVALENTS = [
  { co2: 1000, label: "a long-haul flight to New York" },
  { co2: 270, label: "a flight to Barcelona" },
  { co2: 150, label: "a short flight to London" },
  { co2: 112, label: "a drive to Berlin" },
  { co2: 85, label: "a drive to Paris" },
  { co2: 36, label: "a drive to Brussels" },
  { co2: 13, label: "a drive to Rotterdam" },
  { co2: 7, label: "a drive to Utrecht" },
  { co2: 3, label: "a drive across Amsterdam" }
];
const NEARBY_ORIGINS = new Set(["NETHERLANDS", "BELGIUM", "GERMANY", "LUXEMBOURG"]);

function isProduct(value: unknown): value is Product {
  return typeof value === "object" && value !== null && "id" in value && "name" in value;
}

function isStoredCartItem(value: unknown): value is Pick<CartItem, "id" | "product" | "deliveryOptionId"> {
  return (
    typeof value === "object" &&
    value !== null &&
    "product" in value &&
    isProduct((value as { product?: unknown }).product) &&
    "deliveryOptionId" in value
  );
}

function isDeliveryOptionId(value: unknown): value is DeliveryOptionId {
  return value === "same-day" || value === "next-day" || value === "standard" || value === "recommended";
}

function numericScore(score: string): number {
  const parsedScore = Number(score);

  return Number.isFinite(parsedScore) ? parsedScore : 0;
}

function numericPrice(product: Product): number {
  const priceFrom = Number(product.priceFrom);
  const priceTo = Number(product.priceTo);

  if (Number.isFinite(priceFrom)) {
    return priceFrom;
  }

  if (Number.isFinite(priceTo)) {
    return priceTo;
  }

  return Number.POSITIVE_INFINITY;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function isGreenestOption(product: Product, optionId: DeliveryOptionId): boolean {
  const recommended = displayValue(product.recommendedDeliveryDate, "");

  return (
    (optionId === "same-day" && recommended === "Today") ||
    (optionId === "next-day" && recommended === "Next day") ||
    (optionId === "standard" && recommended === "Standard") ||
    (optionId === "recommended" && recommended === "")
  );
}

// The greenest option is the one tagged by logistics (today: the earliest scheduled shipment).
// Picking a different option is a little less green; the tagged option always scores best.
function adjustedDeliveryScore(product: Product, optionId: DeliveryOptionId): number {
  const baseScore = numericScore(product.finalSustainabilityScore);

  return isGreenestOption(product, optionId) ? baseScore : clampScore(baseScore - 6);
}

function deliveryExplanation(product: Product, optionId: DeliveryOptionId): string {
  return isGreenestOption(product, optionId)
    ? "Greenest available - it lines up with the earliest scheduled shipment, so it needs no extra trip."
    : "A bit less green than the recommended option - a faster promise leaves less room to bundle trips.";
}

function availableDeliveryOptions(product: Product): DeliveryOption[] {
  const optionIds: DeliveryOptionId[] = [];

  if (product.sameDay) {
    optionIds.push("same-day");
  }

  if (product.nextDay) {
    optionIds.push("next-day");
  }

  if (product.normalDelivery) {
    optionIds.push("standard");
  }

  if (optionIds.length === 0) {
    optionIds.push("recommended");
  }

  return optionIds.map((id) => {
    const adjustedScore = adjustedDeliveryScore(product, id);
    const baseScore = numericScore(product.finalSustainabilityScore);
    const isGreenest = isGreenestOption(product, id);

    if (id === "same-day") {
      return {
        id,
        label: "Same day",
        dateLabel: "Today",
        description: deliveryExplanation(product, id),
        adjustedScore,
        scoreDelta: adjustedScore - baseScore,
        isGreenest
      };
    }

    if (id === "next-day") {
      return {
        id,
        label: "Next day",
        dateLabel: "Next day",
        description: deliveryExplanation(product, id),
        adjustedScore,
        scoreDelta: adjustedScore - baseScore,
        isGreenest
      };
    }

    if (id === "standard") {
      return {
        id,
        label: "Standard delivery",
        dateLabel: "Standard",
        description: deliveryExplanation(product, id),
        adjustedScore,
        scoreDelta: adjustedScore - baseScore,
        isGreenest
      };
    }

    return {
      id,
      label: "Greener bundle",
      dateLabel: displayValue(product.recommendedDeliveryDate, "Later this week"),
      description: deliveryExplanation(product, id),
      adjustedScore,
      scoreDelta: adjustedScore - baseScore,
      isGreenest
    };
  });
}

function toCartItem(product: Product, deliveryOptionId: DeliveryOptionId): CartItem {
  return {
    id: `${product.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    product,
    deliveryOptionId,
    adjustedSustainabilityScore: adjustedDeliveryScore(product, deliveryOptionId)
  };
}

function scorePercent(product: Product): number | null {
  const score = parseNumber(product.finalSustainabilityScore);

  return score === null ? null : Math.round(score);
}

function scoreSentence(product: Product): string {
  if (isDigitalProduct(product)) {
    return "Digital product with minimal packaging and transport footprint.";
  }

  const percent = scorePercent(product);
  const reasons: string[] = [];
  const packaging = product.packagingType.toLowerCase();
  const repairability = parseNumber(product.repairabilityScore);
  const lifespan = parseNumber(product.estimatedLifespanYears);

  if (packaging.includes("recyclable") || packaging.includes("biodegradable") || packaging.includes("minimal")) {
    reasons.push(displayValue(product.packagingType).toLowerCase());
  }

  if (NEARBY_ORIGINS.has(product.countryOfOrigin.trim().toUpperCase())) {
    reasons.push("made nearby");
  }

  if ((repairability !== null && repairability >= 6) || (lifespan !== null && lifespan >= 4)) {
    reasons.push("built to last");
  }

  const reasonText = reasons.length > 0 ? ` - ${reasons.slice(0, 3).join(", ")}.` : " based on available product and logistics data.";

  return percent === null ? `Compared to similar products${reasonText}` : `Greener than about ${percent}% of similar products${reasonText}`;
}

function confidenceCopy(product: Product): string {
  if (product.confidenceLevel === "Low") {
    return "Low confidence - based on limited data.";
  }

  if (product.confidenceLevel === "Medium") {
    return "Medium confidence.";
  }

  return "High confidence.";
}

function formatMaybeEuro(value: number | null): string | null {
  return value === null || value <= 0 ? null : formatEuro(value);
}

function formatCo2(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function tripEquivalent(co2: number): string | null {
  return TRIP_EQUIVALENTS.find((trip) => co2 >= trip.co2)?.label ?? null;
}

function checkoutSavingsLine(cart: CartItem[]): string | null {
  const totals = cart.reduce(
    (sum, item) => {
      const savings = productSavings(item.product);

      return {
        euro: sum.euro + savings.euro,
        co2: sum.co2 + savings.co2
      };
    },
    { euro: 0, co2: 0 }
  );

  if (totals.euro <= 0 && totals.co2 <= 0) {
    return null;
  }

  const parts: string[] = [];

  if (totals.euro > 0) {
    parts.push(formatEuro(totals.euro));
  }

  if (totals.co2 > 0) {
    parts.push(`${formatCo2(totals.co2)} kg CO2`);
  }

  const base = `You saved ${parts.join(" and ")}`;
  const equivalent = totals.co2 > 0 ? tripEquivalent(totals.co2) : null;

  return equivalent ? `${base} - The equivalent of ${equivalent}.` : `${base}.`;
}

function alternativeProduct(product: Product, products: Product[]): Product | null {
  if (product.curatedAlternative) {
    return null;
  }

  return products.find((candidate) => candidate.id === product.greenerAlternativeProductId) ?? null;
}

function co2Fact(product: Product): string {
  const value = parseNumber(product.co2Footprint);

  return value === null ? "Manufacturing footprint not available" : `${formatCo2(value)} kg CO2 manufacturing footprint`;
}

function toLegacyCartItem(product: Product, index: number): CartItem {
  const deliveryOptionId = "recommended";

  return {
    id: `legacy-${product.id}-${index}`,
    product,
    deliveryOptionId,
    adjustedSustainabilityScore: adjustedDeliveryScore(product, deliveryOptionId)
  };
}

function hydrateCartItem(item: Pick<CartItem, "id" | "product" | "deliveryOptionId">): CartItem {
  const deliveryOptionId = isDeliveryOptionId(item.deliveryOptionId) ? item.deliveryOptionId : "recommended";

  return {
    ...item,
    deliveryOptionId,
    adjustedSustainabilityScore: adjustedDeliveryScore(item.product, deliveryOptionId)
  };
}

function readStoredCart(): CartItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storedCart = window.localStorage.getItem(CART_STORAGE_KEY);
    const parsedCart: unknown = storedCart ? JSON.parse(storedCart) : [];

    if (!Array.isArray(parsedCart)) {
      return [];
    }

    return parsedCart
      .map((item, index) => {
        if (isStoredCartItem(item)) {
          return hydrateCartItem(item);
        }

        if (isProduct(item)) {
          return toLegacyCartItem(item, index);
        }

        return null;
      })
      .filter((item): item is CartItem => item !== null);
  } catch {
    return [];
  }
}

function writeStoredCart(cart: CartItem[]) {
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  window.dispatchEvent(new Event(CART_UPDATE_EVENT));
}

function useSharedCart(catalog: Product[] = EMPTY_CATALOG) {
  const [cart, setCart] = useState<CartItem[]>([]);

  useEffect(() => {
    function syncCart() {
      const catalogById = new Map(catalog.map((product) => [product.id, product]));
      const storedCart = readStoredCart();
      const hydratedCart = storedCart.map((item) =>
        hydrateCartItem({
          ...item,
          product: catalogById.get(item.product.id) ?? item.product
        })
      );

      setCart(hydratedCart);
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === CART_STORAGE_KEY) {
        syncCart();
      }
    }

    syncCart();
    window.addEventListener("storage", handleStorage);
    window.addEventListener(CART_UPDATE_EVENT, syncCart);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(CART_UPDATE_EVENT, syncCart);
    };
  }, [catalog]);

  function addToCart(product: Product, deliveryOptionId: DeliveryOptionId) {
    const nextCart = [...readStoredCart(), toCartItem(product, deliveryOptionId)];

    writeStoredCart(nextCart);
    setCart(nextCart);
  }

  function removeFromCart(cartItemId: string) {
    const nextCart = readStoredCart().filter((item) => item.id !== cartItemId);

    writeStoredCart(nextCart);
    setCart(nextCart);
  }

  function updateCartItemDelivery(cartItemId: string, deliveryOptionId: DeliveryOptionId) {
    const nextCart = readStoredCart().map((item) =>
      item.id === cartItemId
        ? hydrateCartItem({
            ...item,
            deliveryOptionId
          })
        : item
    );

    writeStoredCart(nextCart);
    setCart(nextCart);
  }

  return { addToCart, cart, removeFromCart, updateCartItemDelivery };
}

export function Storefront({ products }: StorefrontProps) {
  const categories = useMemo(() => ["All", ...Array.from(new Set(products.map((product) => product.category))).sort()], [products]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [sortOption, setSortOption] = useState<SortOptionId>("sustainability-desc");
  const { addToCart, cart, removeFromCart, updateCartItemDelivery } = useSharedCart(products);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const matchingProducts = products
      .filter((product) => category === "All" || product.category === category)
      .filter((product) => {
        if (!sortOption.startsWith("sustainability") || category === "Digital Goods") {
          return true;
        }

        return !isDigitalProduct(product);
      })
      .filter((product) => {
        if (!normalizedQuery) {
          return true;
        }

        return `${product.name} ${product.category} ${product.subcategory}`.toLowerCase().includes(normalizedQuery);
      });

    return [...matchingProducts].sort((firstProduct, secondProduct) => {
      if (sortOption === "sustainability-asc") {
        return numericScore(firstProduct.finalSustainabilityScore) - numericScore(secondProduct.finalSustainabilityScore);
      }

      if (sortOption === "price-asc") {
        return numericPrice(firstProduct) - numericPrice(secondProduct);
      }

      if (sortOption === "price-desc") {
        return numericPrice(secondProduct) - numericPrice(firstProduct);
      }

      if (sortOption === "name-asc") {
        return firstProduct.name.localeCompare(secondProduct.name);
      }

      return numericScore(secondProduct.finalSustainabilityScore) - numericScore(firstProduct.finalSustainabilityScore);
    });
  }, [category, products, query, sortOption]);
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE));
  const activePage = Math.min(currentPage, totalPages);
  const pageStartIndex = (activePage - 1) * PRODUCTS_PER_PAGE;
  const visibleProducts = filteredProducts.slice(pageStartIndex, pageStartIndex + PRODUCTS_PER_PAGE);
  const firstVisibleProduct = filteredProducts.length === 0 ? 0 : pageStartIndex + 1;
  const lastVisibleProduct = Math.min(pageStartIndex + PRODUCTS_PER_PAGE, filteredProducts.length);
  const visiblePageNumbers = useMemo(() => {
    const pageNumbers: number[] = [];
    const firstPage = Math.max(1, activePage - 2);
    const lastPage = Math.min(totalPages, activePage + 2);

    for (let page = firstPage; page <= lastPage; page += 1) {
      pageNumbers.push(page);
    }

    return pageNumbers;
  }, [activePage, totalPages]);

  function addProductToCart(product: Product) {
    setPendingProduct(product);
  }

  function changeQuery(value: string) {
    setQuery(value);
    setCurrentPage(1);
  }

  function changeCategory(value: string) {
    setCategory(value);
    setCurrentPage(1);
  }

  function changeSort(value: SortOptionId) {
    setSortOption(value);
    setCurrentPage(1);
  }

  function confirmDelivery(deliveryOptionId: DeliveryOptionId) {
    if (!pendingProduct) {
      return;
    }

    addToCart(pendingProduct, deliveryOptionId);
    setPendingProduct(null);
    setIsCartOpen(true);
  }

  return (
    <main className="pageShell">
      <Header cartCount={cart.length} query={query} setQuery={changeQuery} onCartClick={() => setIsCartOpen(true)} />

      <section className="heroBand">
        <div className="heroCopy">
          <p className="eyebrow">Bol sustainability hackathon - Track 2</p>
          <h1>Sustainability Brain for faster product choices.</h1>
          <p>
            A Bol-style shopping demo where sustainability appears naturally in browsing, product detail, delivery, and basket moments.
          </p>
          <div className="heroActions">
            <button className="ghostButton" onClick={() => setIsCartOpen(true)}>
              <ShoppingCart size={18} />
              Open basket
            </button>
          </div>
        </div>
        <div className="heroVisual" aria-hidden="true">
          {/* <div className="orbitCard scoreCard">
            <Leaf size={24} />
            <span>Demo score</span>
            <strong>76</strong>
          </div> */}
          <div className="orbitCard routeCard">
            <span className="iconRow">
              <Truck size={24} />
              <Leaf size={15} />
            </span>
            <span>Delivery </span>
            <strong>Choose Greener option</strong>
          </div>
          <div className="productObject">
            <div className="boxLid" />
            <div className="boxBody">
              <PackageCheck size={54} />
            </div>
          </div>
        </div>
      </section>

      <section className="shopLayout">
        <aside className="filtersPanel">
          <p className="panelTitle">Categories</p>
          <div className="categoryList">
            {categories.map((item) => (
              <button className={item === category ? "categoryButton active" : "categoryButton"} key={item} onClick={() => changeCategory(item)}>
                {item}
              </button>
            ))}
          </div>
        </aside>

        <section className="productsArea">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">Products</p>
              <h2>{filteredProducts.length} products</h2>
              <span className="pageRange">
                Showing {firstVisibleProduct}-{lastVisibleProduct} of {filteredProducts.length}
              </span>
            </div>
            <label className="sortControl">
              <span>Sort by</span>
              <select value={sortOption} onChange={(event) => changeSort(event.target.value as SortOptionId)}>
                {SORT_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="productGrid">
            {visibleProducts.map((product) => (
              <ProductCard key={product.id} product={product} onAdd={() => addProductToCart(product)} />
            ))}
          </div>

          {totalPages > 1 && (
            <nav className="paginationBar" aria-label="Product pages">
              <button className="pageArrow" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={activePage === 1}>
                <ChevronLeft size={18} />
                Previous
              </button>
              <div className="pageNumbers">
                {visiblePageNumbers.map((page) => (
                  <button className={page === activePage ? "pageNumber active" : "pageNumber"} key={page} onClick={() => setCurrentPage(page)}>
                    {page}
                  </button>
                ))}
              </div>
              <button
                className="pageArrow"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={activePage === totalPages}
              >
                Next
                <ChevronRight size={18} />
              </button>
            </nav>
          )}
        </section>
      </section>

      <CartPanel
        cart={cart}
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        onDeliveryChange={updateCartItemDelivery}
        onRemove={removeFromCart}
      />
      {pendingProduct && <DeliveryChoiceModal product={pendingProduct} onClose={() => setPendingProduct(null)} onConfirm={confirmDelivery} />}
    </main>
  );
}

export function ProductPage({ product, products }: ProductPageProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [query, setQuery] = useState("");
  const { addToCart, cart, removeFromCart, updateCartItemDelivery } = useSharedCart();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isDeliveryOpen, setIsDeliveryOpen] = useState(false);
  const tone = scoreTone(product.finalSustainabilityScore);

  function addProductToCart() {
    setIsDeliveryOpen(true);
  }

  function confirmDelivery(deliveryOptionId: DeliveryOptionId) {
    addToCart(product, deliveryOptionId);
    setIsDeliveryOpen(false);
    setIsCartOpen(true);
  }

  return (
    <main className="pageShell">
      <Header cartCount={cart.length} query={query} setQuery={setQuery} onCartClick={() => setIsCartOpen(true)} />

      <div className="productPage">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <ChevronRight size={14} />
          <span>{product.category}</span>
          <ChevronRight size={14} />
          <span>{product.subcategory}</span>
        </nav>

        <section className="productMain">
          <div className="galleryPanel">
            <ProductVisual product={product} />
          </div>

          <section className="productInfo">
            <p className="eyebrow">{product.category}</p>
            <h1>{product.name}</h1>
            <div className="ratingRow" aria-label="Product rating">
              {[0, 1, 2, 3, 4].map((star) => (
                <Star fill="currentColor" size={17} key={star} />
              ))}
              <a href="#reviews">128 reviews</a>
              <CertifiedBadge product={product} />
            </div>
            <p className="productIntro">
              A popular {product.subcategory.toLowerCase()} item sold through Bol&apos;s marketplace logistics network, with delivery choices and
              product facts shown in one place.
            </p>

            <ul className="benefitList">
              <li>Available from {displayValue(product.warehouseName, "Bol fulfilment")}</li>
              <li>{deliverySummary(product)}</li>
              <li>30-day returns</li>
            </ul>
          </section>

          <aside className="buyBox">
            <strong className="buyPrice">{formatPrice(product)}</strong>
            <p className="stockText">In stock</p>
            <p className="deliveryPromise">{deliverySummary(product)}</p>
            <button className="primaryButton wide" onClick={addProductToCart}>
              <ShoppingCart size={18} />
              Add to basket
            </button>
            <button className="secondaryButton wide">
              <Heart size={18} />
              Save
            </button>
            <div className="serviceList">
              <span>
                <Truck size={16} /> Delivery options at checkout
              </span>
              <span>
                <RotateCcw size={16} /> Free returns within 30 days
              </span>
              <span>
                <ShieldCheck size={16} /> Sold with marketplace checks
              </span>
            </div>
          </aside>
        </section>

        <section className="productContentGrid">
          <div className="normalDetails">
            <section className="contentPanel">
              <h2>Product description</h2>
              <p>
                This {product.name.toLowerCase()} is positioned for everyday use, with clear delivery availability, warehouse routing, and the
                product facts customers normally scan before buying.
              </p>
            </section>

            <section className="contentPanel">
              <h2>Specifications</h2>
              <div className="specGrid">
                <span>Category</span>
                <strong>{product.category}</strong>
                <span>Subcategory</span>
                <strong>{product.subcategory}</strong>
                <span>Country of origin</span>
                <strong>{displayValue(product.countryOfOrigin, "Unknown")}</strong>
                <span>Packaging</span>
                <strong>{displayValue(product.packagingType, "Not specified")}</strong>
                <span>Repairability score</span>
                <strong>{displayValue(product.repairabilityScore, "Not rated")}</strong>
                <span>Estimated lifespan</span>
                <strong>{displayValue(product.estimatedLifespanYears, "Not specified")} years</strong>
              </div>
            </section>

            <section className="contentPanel" id="reviews">
              <h2>Reviews</h2>
              <div className="reviewRow">
                <strong>4.6 out of 5</strong>
                <span>Customers like the value, fast delivery, and clear product information.</span>
              </div>
            </section>
          </div>

          <aside className="sustainabilityCompact">
            <button
              className={`compactScore ${tone} ${confidenceTone(product.confidenceLevel)}`}
              onClick={() => setShowBreakdown(!showBreakdown)}
            >
              <span>{isDigitalProduct(product) ? "Digital footprint" : "Sustainability score"}</span>

              <div className="scoreRight">
                <LeafScore product={product} size="large" />

                <ChevronDown
                  size={20}
                  className={`arrow ${showBreakdown ? "open" : ""}`}
                />
              </div>
            </button>
            <p className="compactWhy">{scoreSentence(product)}</p>

            <div
              className={`breakdownContainer ${
                showBreakdown ? "open" : ""
              }`}
            >
              <ScoreBreakdown product={product} compact />
            </div>
            <DeliveryBooking product={product} />
            <GreenerAlternativeCard product={product} products={products} />
          </aside>
        </section>
      </div>

      <CartPanel
        cart={cart}
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        onDeliveryChange={updateCartItemDelivery}
        onRemove={removeFromCart}
      />
      {isDeliveryOpen && <DeliveryChoiceModal product={product} onClose={() => setIsDeliveryOpen(false)} onConfirm={confirmDelivery} />}
    </main>
  );
}

function Header({
  cartCount,
  query,
  setQuery,
  onCartClick
}: {
  cartCount: number;
  query: string;
  setQuery: (value: string) => void;
  onCartClick: () => void;
}) {
  return (
    <header className="siteHeader">
      <div className="serviceBar">
        <span>Shop with confidence</span>
        <span>Free shipping from EUR 25</span>
        <span>Same-day, next-day, or scheduled delivery</span>
      </div>
      <div className="mainHeader">
        <button className="iconButton" aria-label="Open categories">
          {/* <Menu size={22} /> */}
        </button>
        <Link className="brandMark" href="/" aria-label="Bol home">
          bol.
        </Link>
        <label className="searchBox">
          <Search size={20} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="What are you looking for?" />
        </label>
        <button className="cartButton" onClick={onCartClick}>
          <ShoppingCart size={20} />
          <span>Basket</span>
          <strong>{cartCount}</strong>
        </button>
      </div>
      {/* <nav className="categoryNav" aria-label="Popular Bol categories">
        <span>Books</span>
        <span>Electronics</span>
        <span>Beauty</span>
        <span>Baby</span>
        <span>Home & Garden</span>
        <span>Sustainable picks</span>
      </nav> */}
    </header>
  );
}

function LeafScore({ product, size = "small" }: { product: Product; size?: "small" | "large" }) {
  if (isDigitalProduct(product)) {
    return <span className={`leafScore digital ${size}`}>Digital - minimal footprint</span>;
  }

  const leaves = leafCount(product.finalSustainabilityScore);

  return (
    <span className={`leafScore ${confidenceTone(product.confidenceLevel)} ${size}`} aria-label={`${leaves} out of 5 leaves`}>
      {Array.from({ length: 5 }, (_, index) => (
        <Leaf className={index < leaves ? "filled" : "empty"} fill={index < leaves ? "currentColor" : "none"} size={size === "large" ? 15 : 11} key={index} />
      ))}
      <span>{leaves}/5</span>
    </span>
  );
}

function ConfidenceIndicator({ product }: { product: Product }) {
  return (
    <span className={`confidencePill ${confidenceTone(product.confidenceLevel)}`}>
      <span className="confidenceDot" />
      {displayValue(product.confidenceLevel, "Unknown")}
    </span>
  );
}

function CertifiedBadge({ product }: { product: Product }) {
  if (!product.bolCertified) {
    return null;
  }

  return (
    <span className="certifiedBadge">
      <ShieldCheck size={14} />
      Goede Keuze
    </span>
  );
}

function ProductCard({ product, onAdd }: { product: Product; onAdd: () => void }) {
  const productUrl = `/product/${product.id}`;

  return (
    <article className="productCard">
      <Link className="productImage" href={productUrl} aria-label={`View ${product.name}`}>
        <ProductVisual product={product} />
      </Link>
      <div className="productMeta">
        <Link className="productName" href={productUrl}>
          {product.name}
        </Link>
        <span className="subcategory">{product.subcategory}</span>
        <div className="priceRow">
          <strong>{formatPrice(product)}</strong>
          <span>{deliverySummary(product)}</span>
        </div>
        <div className="sustainabilityRow">
          <Link className={`scoreBadge ${scoreTone(product.finalSustainabilityScore)}`} href={productUrl}>
            <LeafScore product={product} />
          </Link>
          <CertifiedBadge product={product} />
        </div>
      </div>
      <button className="addButton" onClick={onAdd}>
        Add to basket
      </button>
    </article>
  );
}

function ProductVisual({ product }: { product: Product }) {
  const categoryClass = product.category.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return (
    <div className={`visualAsset ${categoryClass}`}>
      <Box size={46} />
      <span>{product.category}</span>
    </div>
  );
}

function ScoreBreakdown({ product, compact = false }: { product: Product; compact?: boolean }) {
  const fitToSize = ["BFC1", "BFCXL", "BFCXL2"].includes(product.warehouseCode.trim());
  const packFact = `${displayValue(product.packagingType, "Packaging not specified")}${
    fitToSize ? " - fit-to-size packing (~28% less CO2 per parcel)" : ""
  }`;
  const rows = [
    {
      label: "Make",
      value: product.makeScore,
      fact: co2Fact(product)
    },
    {
      label: "Move",
      value: product.transportScore,
      fact: `${displayValue(product.countryOfOrigin, "Origin unknown")} origin`
    },
    {
      label: "Pack",
      value: product.subScore1,
      fact: packFact
    },
    {
      label: "Last",
      value: product.lastScore,
      fact: `Repairability ${displayValue(product.repairabilityScore, "not rated")}; lifespan ${displayValue(product.estimatedLifespanYears, "not specified")} years`
    }
  ];

  return (
    <section className={compact ? "infoPanel compactPanel" : "infoPanel"}>
      <div className="miniHeader">
        <ShieldCheck size={18} />
        <h3>Why this score?</h3>
      </div>
      <p className="whyLine">{scoreSentence(product)}</p>
      <div className="sustainabilityRow">
        <LeafScore product={product} />
        <ConfidenceIndicator product={product} />
        <CertifiedBadge product={product} />
      </div>
      <div className="scoreRows">
        {rows.map((row) => (
          <div className="scoreRow" key={row.label}>
            <div>
              <span>{row.label}</span>
              <small>{row.fact}</small>
            </div>
            <span className="scoreBar" aria-hidden="true">
              <span style={{ width: `${Math.max(0, Math.min(100, numericScore(row.value)))}%` }} />
            </span>
            <strong>{displayValue(row.value)}</strong>
          </div>
        ))}
      </div>
      {product.ecoLabel.trim() && (
        <div className="dataGaps">
          <span>Certificate</span>
          <p title={displayValue(product.ecoLabelScope, "Scope not available")}>
            {displayValue(product.ecoLabel)} - {displayValue(product.ecoLabelScope, "scope not available")}
          </p>
        </div>
      )}
      <div className="dataGaps">
        <span>Confidence</span>
        <p>
          {confidenceCopy(product)} {displayValue(product.missingDataGaps, "")}
        </p>
      </div>
    </section>
  );
}

function DeliveryBooking({ product }: { product: Product }) {
  const options = availableDeliveryOptions(product);
  const greenestOption = options.find((option) => option.isGreenest);

  return (
    <section className="infoPanel compactPanel">
      <div className="miniHeader">
        <CalendarDays size={18} />
        <h3>Greener delivery</h3>
      </div>
      <div className="deliveryOptions">
        {options.map((option) => (
          <button className={option.isGreenest ? "deliveryOption active" : "deliveryOption"} key={option.id}>
            {option.isGreenest && <Check size={16} />}
            <span>{option.label}</span>
            {option.isGreenest && <strong>Greenest</strong>}
          </button>
        ))}
      </div>
      <div className="nudgeBox">
        <Truck size={20} />
        <p>
          {greenestOption
            ? `${greenestOption.dateLabel} is tagged as the greenest available delivery option.`
            : "The greenest delivery option is shown when logistics data is available."}
        </p>
      </div>
    </section>
  );
}

function GreenerAlternativeCard({ product, products }: { product: Product; products: Product[] }) {
  if (!hasAlternative(product)) {
    return null;
  }

  const curated = product.curatedAlternative;
  const alternative = alternativeProduct(product, products);
  const savings = productSavings(product);
  const euroSaving = formatMaybeEuro(savings.euro);
  const co2 = parseNumber(product.co2Footprint);
  const alternativeCo2 = alternative ? parseNumber(alternative.co2Footprint) : null;
  const maxCo2 = co2 !== null && alternativeCo2 !== null ? Math.max(co2, alternativeCo2) : null;

  return (
    <section className="infoPanel compactPanel alternativePanel">
      <div className="miniHeader">
        <Leaf size={18} />
        <h3>Greener alternative</h3>
      </div>

      {curated ? (
        <a className="alternativeCard" href={curated.url} target="_blank" rel="noreferrer">
          <div>
            <span>{curated.brand}</span>
            <strong>{curated.name}</strong>
            <p>{curated.sustainabilityNote}</p>
          </div>
          {curated.priceEur !== null && <b>{formatEuro(curated.priceEur)}</b>}
        </a>
      ) : alternative ? (
        <Link className="alternativeCard" href={`/product/${alternative.id}`}>
          <ProductVisual product={alternative} />
          <div>
            <span>{alternative.subcategory}</span>
            <strong>{alternative.name}</strong>
            <p>{formatPrice(alternative)}</p>
          </div>
          <LeafScore product={alternative} />
        </Link>
      ) : (
        <div className="alternativeCard muted">
          <div>
            <span>Matched product</span>
            <strong>{displayValue(product.greenerAlternativeProductId)}</strong>
            <p>Auto-matched by category; product detail is not in this demo catalog.</p>
          </div>
        </div>
      )}

      <div className="nudgeChips">
        {euroSaving && <span>{euroSaving} cheaper</span>}
        <span>Greener pick</span>
      </div>

      {maxCo2 !== null && co2 !== null && alternativeCo2 !== null && (
        <div className="footprintCompare">
          <div>
            <span>This</span>
            <strong>{formatCo2(co2)} kg CO2</strong>
            <i style={{ width: `${Math.max(8, (co2 / maxCo2) * 100)}%` }} />
          </div>
          <div>
            <span>Greener</span>
            <strong>{formatCo2(alternativeCo2)} kg CO2</strong>
            <i style={{ width: `${Math.max(8, (alternativeCo2 / maxCo2) * 100)}%` }} />
          </div>
        </div>
      )}
    </section>
  );
}

function CartPanel({
  cart,
  isOpen,
  onClose,
  onDeliveryChange,
  onRemove
}: {
  cart: CartItem[];
  isOpen: boolean;
  onClose: () => void;
  onDeliveryChange: (cartItemId: string, deliveryOptionId: DeliveryOptionId) => void;
  onRemove: (cartItemId: string) => void;
}) {
  const savingsLine = checkoutSavingsLine(cart);

  return (
    <aside className={isOpen ? "cartPanel open" : "cartPanel"} aria-hidden={!isOpen}>
      <div className="cartHeader">
        <div>
          <p className="eyebrow">Basket</p>
          <h2>{cart.length} items</h2>
        </div>
        <button className="iconButton" onClick={onClose} aria-label="Close basket">
          <X size={20} />
        </button>
      </div>

      <div className="cartItems">
        {cart.length === 0 ? (
          <p className="emptyCart">Cart is Empty.</p>
        ) : (
          cart.map((item) => {
            const options = availableDeliveryOptions(item.product);
            const selectedOption = options.find((option) => option.id === item.deliveryOptionId) ?? options[0];

            return (
              <div className="cartItem" key={item.id}>
                <ProductVisual product={item.product} />
                <div className="cartItemDetails">
                  <div className="cartItemTopline">
                    <strong>{item.product.name}</strong>
                    <button className="removeItemButton" onClick={() => onRemove(item.id)} aria-label={`Remove ${item.product.name}`}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <span>{formatPrice(item.product)}</span>
                  <label className="cartDeliverySelect">
                    <CalendarDays size={14} />
                    <select
                      value={item.deliveryOptionId}
                      onChange={(event) => onDeliveryChange(item.id, event.target.value as DeliveryOptionId)}
                    >
                      {options.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label} - {option.dateLabel}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span>
                    Delivery: {selectedOption.label}
                    {selectedOption.isGreenest ? " - Greenest" : ""}
                  </span>
                  {hasAlternative(item.product) && <span>Greener alternative available</span>}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="cartFooter">
        {savingsLine && (
          <div className="checkoutSavings">
            <Leaf size={18} />
            <strong>{savingsLine}</strong>
          </div>
        )}
        <button className="primaryButton wide" disabled={cart.length === 0}>
          <ShoppingCart size={18} />
          Checkout
        </button>
      </div>
    </aside>
  );
}

function DeliveryChoiceModal({
  product,
  onClose,
  onConfirm
}: {
  product: Product;
  onClose: () => void;
  onConfirm: (deliveryOptionId: DeliveryOptionId) => void;
}) {
  const options = availableDeliveryOptions(product);
  const [selectedOptionId, setSelectedOptionId] = useState<DeliveryOptionId>((options.find((option) => option.isGreenest) ?? options[0]).id);
  const selectedOption = options.find((option) => option.id === selectedOptionId) ?? options[0];

  return (
    <div className="modalBackdrop" role="presentation">
      <section className="deliveryModal" role="dialog" aria-modal="true" aria-labelledby="delivery-choice-title">
        <div className="modalHeader">
          <div>
            <p className="eyebrow">Delivery date</p>
            <h2 id="delivery-choice-title">Choose when to deliver</h2>
          </div>
          <button className="iconButton" onClick={onClose} aria-label="Close delivery choices">
            <X size={20} />
          </button>
        </div>

        <p className="modalProductName">{product.name}</p>
        <div className="deliveryChoiceList">
          {options.map((option) => (
            <button
              className={selectedOptionId === option.id ? "deliveryChoice selected" : "deliveryChoice"}
              key={option.id}
              onClick={() => setSelectedOptionId(option.id)}
            >
              <span>
                <strong>{option.label}</strong>
                <small>{option.dateLabel}</small>
              </span>
              {option.isGreenest && <span className="greenestTag">Greenest</span>}
            </button>
          ))}
        </div>

        <div className="nudgeBox">
          <Truck size={20} />
          <p>{selectedOption.description}</p>
        </div>

        <button className="primaryButton wide" onClick={() => onConfirm(selectedOptionId)}>
          <ShoppingCart size={18} />
          Add to basket
        </button>
      </section>
    </div>
  );
}

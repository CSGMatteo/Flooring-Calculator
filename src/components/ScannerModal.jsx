import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

export default function ScannerModal({
  onClose,
  onSelect,
  mode = "select",
}) {
  const videoRef = useRef(null);
  const searchInputRef = useRef(null);
  const scanLockRef = useRef(false);

  const [scanLocked, setScanLocked] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  const [result, setResult] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  // Used only when mode === "price"
  const [savedItems, setSavedItems] = useState([]);


  /* =========================================================
     INITIAL FOCUS
  ========================================================= */

  useEffect(() => {
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
  }, []);


  /* =========================================================
     DATE / PRICE HELPERS
  ========================================================= */

  function getTodayString() {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }


  function isOnSale(item) {
    if (
      item.sale_price === null ||
      item.sale_price === undefined ||
      item.sale_price === "" ||
      !item.sale_end_date
    ) {
      return false;
    }

    return getTodayString() <= item.sale_end_date;
  }

  function getPriceInfo(item) {
    const toPrice = (value) => {
      if (
        value === null ||
        value === undefined ||
        value === ""
      ) {
        return null;
      }

      const number = Number(value);

      return Number.isFinite(number) ? number : null;
    };

    const regularPrice = toPrice(item.regular_price);
    const salePrice = toPrice(item.sale_price);
    const tariffPrice = toPrice(item.tariff_price);

    const saleActive = isOnSale(item) && salePrice !== null;

    const basePrice = saleActive
      ? salePrice
      : regularPrice;
    
    const tariffApplied = 
      tariffPrice !== null &&
      (basePrice === null || tariffPrice > basePrice);
    
    const currentPrice = tariffApplied
      ? tariffPrice
      : basePrice;
    
    return {
      currentPrice,
      tariffApplied,
      saleApplied: saleActive && !tariffApplied,
    };
  }

  function getCurrentPrice(item) {
    return getPriceInfo(item).currentPrice;
  }


  function formatPrice(price) {
    if (
      price === null ||
      price === undefined ||
      price === "" ||
      Number.isNaN(Number(price))
    ) {
      return "Price unavailable";
    }

    return `$${Number(price).toFixed(2)}/sqft`;
  }


  function formatDate(dateString) {
    if (!dateString) return "";

    const date = new Date(`${dateString}T00:00:00`);

    return date.toLocaleDateString("en-CA", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }


  function getDisplayName(item) {
    if (
      item.variant_name &&
      item.variant_name !== "Standard"
    ) {
      return `${item.sample_name} - ${item.variant_name}`;
    }

    return item.sample_name;
  }


  /* =========================================================
     LOOK UP BARCODE
  ========================================================= */

  async function getSampleByBarcode(code) {
    const cleanCode = String(code).trim();


    const { data: sample, error: sampleError } = await supabase
      .from("Samples")
      .select(`
        barcode,
        sample_name,
        manufacturer,
        product_type,
        installation_type,
        quantity_owned,
        active,
        notes
      `)
      .eq("barcode", cleanCode)
      .eq("active", true)
      .maybeSingle();


    if (sampleError) {
      console.error("Samples lookup error:", sampleError);
      throw sampleError;
    }


    if (!sample) {
      return null;
    }


    const { data: variants, error: variantError } = await supabase
      .from("Sample_Variants")
      .select(`
        barcode,
        sample_name,
        manufacturer,
        regular_price,
        tariff_price,
        sale_price,
        sale_end_date,
        variant_code,
        variant_name,
        grade,
        construction,
        thickness,
        width,
        active,
        notes
      `)
      .eq("barcode", cleanCode)
      .eq("active", true)
      .order("variant_code", { ascending: true });


    if (variantError) {
      console.error("Variant lookup error:", variantError);
      throw variantError;
    }


    return {
      sample,
      variants: variants || [],
    };
  }


  /* =========================================================
     BARCODE SEARCH
  ========================================================= */

  async function lookupBarcode(code) {
    const cleanCode = String(code).trim();

    if (!cleanCode) return;


    scanLockRef.current = true;

    setScanLocked(true);
    setLoading(true);
    setResult(null);
    setCameraOpen(false);


    try {
      const data = await getSampleByBarcode(cleanCode);


      if (!data) {
        setResult({
          type: "error",
          message: "No active sample found for this barcode.",
        });

        return;
      }


      if (data.variants.length === 0) {
        setResult({
          type: "error",
          message: "Product found, but no active pricing was found.",
        });

        return;
      }


      if (data.variants.length === 1) {
        const item = {
          ...data.variants[0],

          sample_name: data.sample.sample_name,
          manufacturer: data.sample.manufacturer,
          product_type: data.sample.product_type,
          installation_type: data.sample.installation_type,
          quantity_owned: data.sample.quantity_owned,
        };


        setResult({
          type: "single",
          sample: data.sample,
          item,
        });

        return;
      }


      const items = data.variants.map((variant) => ({
        ...variant,

        sample_name: data.sample.sample_name,
        manufacturer: data.sample.manufacturer,
        product_type: data.sample.product_type,
        installation_type: data.sample.installation_type,
        quantity_owned: data.sample.quantity_owned,
      }));


      setResult({
        type: "multiple",
        sample: data.sample,
        items,
      });

    } catch (error) {
      console.error("Price lookup error:", error);

      setResult({
        type: "error",
        message: "There was a problem checking the price.",
      });

    } finally {
      setLoading(false);
    }
  }


  /* =========================================================
     CAMERA
  ========================================================= */

  useEffect(() => {
    if (!cameraOpen || !videoRef.current) return;


    let reader;
    let cancelled = false;


    async function startScanner() {
      try {
        const ZXing = await import("@zxing/library");

        if (cancelled) return;


        reader = new ZXing.BrowserMultiFormatReader();


        reader.decodeFromVideoDevice(
          null,
          videoRef.current,
          (res) => {
            if (
              res &&
              res.text &&
              !scanLockRef.current
            ) {
              lookupBarcode(res.text);
            }
          }
        );

      } catch (error) {
        console.error("Camera scanner error:", error);

        setResult({
          type: "error",
          message: "Unable to start the camera scanner.",
        });

        setCameraOpen(false);
      }
    }


    startScanner();


    return () => {
      cancelled = true;

      if (reader) {
        reader.reset();
      }
    };

  }, [cameraOpen]);


  /* =========================================================
     MANUAL SEARCH / PHYSICAL BARCODE SCANNER
  ========================================================= */

  async function manualSearch() {
    const q = search.trim();

    if (!q || loading) return;


    /*
      Physical scanner types the barcode and presses Enter.
    */
    if (/^\d+$/.test(q)) {
      await lookupBarcode(q);
      return;
    }


    scanLockRef.current = true;

    setScanLocked(true);
    setLoading(true);
    setResult(null);


    try {
      /*
        Search the main sample name.
      */
      const { data: sampleMatches, error: sampleSearchError } =
        await supabase
          .from("Samples")
          .select(`
            barcode,
            sample_name,
            manufacturer,
            product_type,
            installation_type,
            quantity_owned,
            active
          `)
          .eq("active", true)
          .ilike("sample_name", `%${q}%`)
          .limit(30);


      if (sampleSearchError) {
        throw sampleSearchError;
      }


      /*
        Also search variant names.

        This lets something like "Platinum" be searched even
        if the main sample name is "Sap".
      */
      const { data: variantMatches, error: variantSearchError } =
        await supabase
          .from("Sample_Variants")
          .select(`
            barcode,
            sample_name,
            manufacturer,
            regular_price,
            tariff_price,
            sale_price,
            sale_end_date,
            variant_code,
            variant_name,
            grade,
            construction,
            thickness,
            width,
            active,
            notes
          `)
          .eq("active", true)
          .or(
            `sample_name.ilike.%${q}%,variant_name.ilike.%${q}%`
          )
          .limit(50);


      if (variantSearchError) {
        throw variantSearchError;
      }


      const barcodeSet = new Set();


      (sampleMatches || []).forEach((sample) => {
        barcodeSet.add(sample.barcode);
      });


      (variantMatches || []).forEach((variant) => {
        barcodeSet.add(variant.barcode);
      });


      const barcodes = [...barcodeSet];


      if (barcodes.length === 0) {
        setResult({
          type: "error",
          message: "No matches found.",
        });

        return;
      }


      const { data: samples, error: samplesError } = await supabase
        .from("Samples")
        .select(`
          barcode,
          sample_name,
          manufacturer,
          product_type,
          installation_type,
          quantity_owned,
          active
        `)
        .in("barcode", barcodes)
        .eq("active", true);


      if (samplesError) {
        throw samplesError;
      }


      const { data: allVariants, error: variantsError } =
        await supabase
          .from("Sample_Variants")
          .select(`
            barcode,
            sample_name,
            manufacturer,
            regular_price,
            tariff_price,
            sale_price,
            sale_end_date,
            variant_code,
            variant_name,
            grade,
            construction,
            thickness,
            width,
            active,
            notes
          `)
          .in("barcode", barcodes)
          .eq("active", true)
          .order("barcode", { ascending: true })
          .order("variant_code", { ascending: true });


      if (variantsError) {
        throw variantsError;
      }


      const items = [];


      (samples || []).forEach((sample) => {
        const query = q.toLowerCase();

        const sampleNameMatched =
          sample.sample_name
            ?.toLowerCase()
            .includes(query);


        let relevantVariants = (allVariants || []).filter(
          (variant) =>
            variant.barcode === sample.barcode
        );


        /*
          If the main sample name matched, show all variants.

          If only a variant name matched, show only those matching
          variants.
        */
        if (!sampleNameMatched) {
          relevantVariants = relevantVariants.filter((variant) => {
            const variantSampleName =
              variant.sample_name?.toLowerCase() || "";

            const variantName =
              variant.variant_name?.toLowerCase() || "";


            return (
              variantSampleName.includes(query) ||
              variantName.includes(query)
            );
          });
        }


        relevantVariants.forEach((variant) => {
          items.push({
            ...variant,

            sample_name: sample.sample_name,
            manufacturer: sample.manufacturer,
            product_type: sample.product_type,
            installation_type: sample.installation_type,
            quantity_owned: sample.quantity_owned,
          });
        });
      });


      if (items.length === 0) {
        setResult({
          type: "error",
          message: "Products were found, but no active pricing was found.",
        });

        return;
      }


      if (items.length === 1) {
        setResult({
          type: "single",
          sample: items[0],
          item: items[0],
        });

        return;
      }


      setResult({
        type: "multiple",
        sample: null,
        items,
      });

    } catch (error) {
      console.error("Manual price search error:", error);

      setResult({
        type: "error",
        message: "There was a problem searching.",
      });

    } finally {
      setLoading(false);
    }
  }


  /* =========================================================
     RESET / SCAN NEXT
  ========================================================= */

  function unlock() {
    scanLockRef.current = false;

    setScanLocked(false);
    setResult(null);
    setSearch("");
    setCameraOpen(false);


    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
  }


  /* =========================================================
     NORMAL SELECT MODE
  ========================================================= */

  function handleSelect(item) {
    const currentPrice = getCurrentPrice(item);


    const selectedItem = {
      ...item,

      current_price: currentPrice,
      on_sale: getPriceInfo(item).saleApplied,
      tariff_applied: getPriceInfo(item).tariffApplied,

      /*
        Legacy fields so your existing sample-signout code can
        continue using ScannerModal.
      */
      "Item Name": getDisplayName(item),
      "Price": formatPrice(currentPrice),
    };


    if (onSelect) {
      onSelect(selectedItem);
    }

    onClose();
  }


  /* =========================================================
     SAVE FOR COMPARISON
  ========================================================= */

  function saveForComparison(item) {
    const savedItem = {
      ...item,

      current_price: getCurrentPrice(item),
      on_sale: getPriceInfo(item).saleApplied,
      tariff_applied: getPriceInfo(item).tariffApplied,
    };


    setSavedItems((previousItems) => {
      /*
        Barcode + variant code identifies an individual
        price variation.

        This prevents accidentally saving the exact same
        product multiple times.
      */
      const alreadySaved = previousItems.some(
        (existing) =>
          existing.barcode === savedItem.barcode &&
          existing.variant_code === savedItem.variant_code
      );


      if (alreadySaved) {
        return previousItems;
      }


      return [
        ...previousItems,
        savedItem,
      ];
    });


    /*
      Immediately reset so another physical barcode can be
      scanned without additional clicks.
    */
    unlock();
  }


  function removeSavedItem(itemToRemove) {
    setSavedItems((previousItems) =>
      previousItems.filter(
        (item) =>
          !(
            item.barcode === itemToRemove.barcode &&
            item.variant_code === itemToRemove.variant_code
          )
      )
    );
  }


  function clearSavedItems() {
    setSavedItems([]);
  }




  /* =========================================================
     REUSABLE PRICE DISPLAY
  ========================================================= */

  function PriceDisplay({ item, compact = false }) {
    const {
      currentPrice,
      tariffApplied,
      saleApplied,
    } = getPriceInfo(item);

    if (tariffApplied) {
      return (
        <div className={`scanner-price-block ${compact ? "scanner-price-block--compact" : ""}`}>
          <div
            className={`scanner-price-value ${compact ? "scanner-price-value--compact" : ""}`}
          >
            {formatPrice(currentPrice)}
          </div>

          <div className="scanner-tariff-notice">
            <span>ⓘ</span>
            <span>
              Tariff-adjusted price — tariff included
            </span>
          </div>
        </div>
      );
    }

    if (saleApplied) {
      return (
        <div className={`scanner-price-block ${compact ? "scanner-price-block--compact" : ""}`}>
          <div
            className={`scanner-price-value scanner-price-value--sale ${compact ? "scanner-price-value--compact" : ""}`}
          >
            SALE {formatPrice(currentPrice)}
          </div>

          <div className="scanner-regular-strike">
            Regular {formatPrice(item.regular_price)}
          </div>

          <div className="scanner-sale-expiry">
            Valid Until {formatDate(item.sale_end_date)}
          </div>
        </div>
      );
    }

    return (
      <div
        className={`scanner-price-value scanner-price-value--regular ${compact ? "scanner-price-value--compact" : ""}`}
      >
        {formatPrice(currentPrice)}
      </div>
    );
  }


  /* =========================================================
     RESULT BUTTONS
  ========================================================= */

  function ResultButtons({ item }) {
    /*
      PRICE CHECK MODE
    */
    if (mode === "price") {
      return (
        <div className="scanner-action-row">

          <button
            className="scanner-button scanner-button--blue"
            onClick={() => saveForComparison(item)}
          >
            Save for Comparison
          </button>


          <button
            className="scanner-button scanner-button--green"
            onClick={unlock}
          >
            Scan Next
          </button>

        </div>
      );
    }


    /*
      NORMAL SAMPLE SELECT MODE
    */
    return (
      <div className="scanner-action-row">

        <button
          className="scanner-button scanner-button--blue"
          onClick={() => handleSelect(item)}
        >
          Use This
        </button>


        <button
          className="scanner-button scanner-button--green"
          onClick={unlock}
        >
          Scan Next
        </button>

      </div>
    );
  }


  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="scanner-overlay">

      <div
        className={`scanner-modal ${mode === "price" ? "scanner-modal--price" : "scanner-modal--select"}`}
      >

        {/* =====================================================
            HEADER
        ===================================================== */}

        <div className="scanner-header">

          <h2 className="scanner-heading">
            💲 Price Checker
          </h2>


          <button
            className="scanner-icon-button"
            onClick={onClose}
            aria-label="Close price checker"
          >
            ✕
          </button>

        </div>


        {/* =====================================================
            MAIN LAYOUT

            Phones:
                Everything stacks vertically.

            Larger tablets / computers:
                Search/result on left.
                Comparison list on right.
        ===================================================== */}

        <div
          className={`scanner-layout ${mode === "price" ? "scanner-layout--price" : ""}`}
        >

          {/* ===================================================
              LEFT SIDE - SEARCH / RESULT
          =================================================== */}

          <div className="scanner-main">

            {/* SEARCH BAR */}

            <input
              ref={searchInputRef}
              autoFocus
              placeholder="Scan barcode or enter product name"
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  manualSearch();
                }
              }}
              className="scanner-search-input"
            />


            {/* SEARCH + CAMERA BUTTONS */}

            <div className="scanner-search-actions">

              <button
                className="scanner-button scanner-button--blue"
                onClick={manualSearch}
                disabled={loading}
              >
                {loading
                  ? "Searching..."
                  : "Search"}
              </button>


              <button
                className="scanner-button scanner-button--green"
                onClick={() => {
                  if (!cameraOpen) {
                    scanLockRef.current = false;

                    setScanLocked(false);
                    setResult(null);
                  }


                  setCameraOpen(
                    (current) => !current
                  );
                }}
              >
                {cameraOpen
                  ? "Close Camera"
                  : "📷 Use Camera"}
              </button>

            </div>


            {/* CAMERA */}

            {cameraOpen && (
              <div className="scanner-camera-frame">

                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="scanner-video"
                />

              </div>
            )}


            {/* =================================================
                RESULT AREA
            ================================================= */}

            <div className="scanner-result-panel">

              {!result && !loading && (
                <div className="scanner-message scanner-muted">
                  Scan a sample or search by product name.
                </div>
              )}


              {loading && (
                <div className="scanner-message">
                  Checking price...
                </div>
              )}


              {/* ERROR */}

              {result?.type === "error" && (
                <div className="scanner-center">

                  <div className="scanner-error">
                    {result.message}
                  </div>


                  <button
                    className="scanner-button scanner-button--gray scanner-retry"
                    onClick={unlock}
                  >
                    Try Again
                  </button>

                </div>
              )}


              {/* ===============================================
                  SINGLE PRICE
              =============================================== */}

              {result?.type === "single" && (
                <div>

                  <div className="scanner-center">

                    <div className="scanner-product-name">
                      {result.item.sample_name}
                    </div>


                    {result.item.variant_name &&
                      result.item.variant_name !== "Standard" && (
                        <div className="scanner-variant-name">
                          {result.item.variant_name}
                        </div>
                      )}


                    {result.item.manufacturer && (
                      <div className="scanner-manufacturer">
                        {result.item.manufacturer}
                      </div>
                    )}


                    <PriceDisplay
                      item={result.item}
                    />

                  </div>


                  <ResultButtons
                    item={result.item}
                  />

                </div>
              )}


              {/* ===============================================
                  MULTIPLE VARIANTS / SEARCH RESULTS
              =============================================== */}

              {result?.type === "multiple" && (
                <div>

                  {result.sample && (
                    <div className="scanner-center scanner-product-heading">

                      <div className="scanner-product-name">
                        {result.sample.sample_name}
                      </div>


                      {result.sample.manufacturer && (
                        <div className="scanner-manufacturer">
                          {result.sample.manufacturer}
                        </div>
                      )}

                    </div>
                  )}


                  <div className="scanner-results-label">
                    Select a price:
                  </div>


                  <div className="scanner-card-list">

                    {result.items.map((item) => (

                      <div
                        key={`${item.barcode}-${item.variant_code}`}
                        className="scanner-card"
                      >

                        {/* NAME */}

                        <div className="scanner-card-title">

                          {result.sample
                            ? (
                                item.variant_name === "Standard"
                                  ? "Standard"
                                  : item.variant_name
                              )
                            : getDisplayName(item)
                          }

                        </div>


                        {/* DETAILS */}

                        {(item.grade ||
                          item.construction ||
                          item.thickness ||
                          item.width) && (

                          <div className="scanner-details">

                            {[
                              item.grade,
                              item.construction,
                              item.thickness,
                              item.width,
                            ]
                              .filter(Boolean)
                              .join(" • ")}

                          </div>
                        )}


                        <PriceDisplay
                          item={item}
                          compact
                        />


                        {mode === "price" ? (

                          <button
                            className="scanner-button scanner-button--blue scanner-full-action"
                            onClick={() =>
                              saveForComparison(item)
                            }
                          >
                            Save for Comparison
                          </button>

                        ) : (

                          <button
                            className="scanner-button scanner-button--blue scanner-full-action"
                            onClick={() =>
                              handleSelect(item)
                            }
                          >
                            Select
                          </button>

                        )}

                      </div>
                    ))}

                  </div>


                  <button
                    className="scanner-button scanner-button--gray scanner-cancel"
                    onClick={unlock}
                  >
                    Cancel
                  </button>

                </div>
              )}

            </div>

          </div>


          {/* ===================================================
              RIGHT SIDE - SAVED COMPARISON
              ONLY EXISTS IN PRICE MODE
          =================================================== */}

          {mode === "price" && (

            <div className="scanner-comparison">

              {/* HEADER */}

              <div className="scanner-comparison-header">

                <div>

                  <h3 className="scanner-comparison-title">
                    Saved Comparison
                  </h3>


                  <div className="scanner-comparison-count">
                    {savedItems.length}{" "}
                    {savedItems.length === 1
                      ? "sample"
                      : "samples"}
                  </div>

                </div>


                {savedItems.length > 0 && (
                  <button
                    className="scanner-button scanner-button--red scanner-clear"
                    onClick={clearSavedItems}
                  >
                    Clear All
                  </button>
                )}

              </div>


              {/* EMPTY COMPARISON */}

              {savedItems.length === 0 && (
                <div className="scanner-comparison-empty">

                  <div className="scanner-empty-icon">
                    🏷️
                  </div>

                  <div>
                    Saved samples will appear here.
                  </div>

                  <div className="scanner-empty-hint">
                    Scan a product, then press
                    {" "}
                    <strong>
                      Save for Comparison
                    </strong>.
                  </div>

                </div>
              )}


              {/* SAVED ITEMS */}

              <div className="scanner-card-list">

                {savedItems.map((item) => (

                  <div
                    key={`${item.barcode}-${item.variant_code}`}
                    className="scanner-card"
                  >

                    <div className="scanner-card-top">

                      <div className="scanner-min-width">

                        <div className="scanner-card-title scanner-break">
                          {item.sample_name}
                        </div>


                        {item.variant_name &&
                          item.variant_name !== "Standard" && (

                            <div className="scanner-variant">
                              {item.variant_name}
                            </div>
                          )}


                        {item.manufacturer && (
                          <div className="scanner-details scanner-details--spaced">
                            {item.manufacturer}
                          </div>
                        )}

                      </div>


                      <button
                        className="scanner-icon-button scanner-icon-button--danger"
                        onClick={() =>
                          removeSavedItem(item)
                        }
                        aria-label={`Remove ${getDisplayName(item)}`}
                      >
                        ✕
                      </button>

                    </div>


                    {/* EXTRA DETAILS */}

                    {(item.grade ||
                      item.construction ||
                      item.thickness ||
                      item.width) && (

                      <div className="scanner-details scanner-details--spaced">

                        {[
                          item.grade,
                          item.construction,
                          item.thickness,
                          item.width,
                        ]
                          .filter(Boolean)
                          .join(" • ")}

                      </div>
                    )}


                    {/* PRICE */}

                    <PriceDisplay
                      item={item}
                      compact
                    />

                  </div>
                ))}

              </div>

            </div>
          )}

        </div>


        {/* =====================================================
            BOTTOM BUTTONS
        ===================================================== */}

        <div className="scanner-bottom-actions">


          <button
            className="scanner-button scanner-button--gray"
            onClick={onClose}
          >
            Close
          </button>

        </div>

      </div>

    </div>
  );
}
import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";


const SHEET_VIEW_URL =
  "https://docs.google.com/spreadsheets/d/1VMPWmQUbbHK0JE_8ldfsc2G454vVPkFnLhjATuVKil8/edit?gid=0#gid=0";


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


  function getCurrentPrice(item) {
    if (isOnSale(item)) {
      return Number(item.sale_price);
    }

    if (
      item.regular_price === null ||
      item.regular_price === undefined ||
      item.regular_price === ""
    ) {
      return null;
    }

    return Number(item.regular_price);
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
      on_sale: isOnSale(item),

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
      on_sale: isOnSale(item),
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
     OLD SPREADSHEET BUTTON
  ========================================================= */

  function openSpreadsheet() {
    window.open(SHEET_VIEW_URL, "_blank");
  }


  /* =========================================================
     REUSABLE PRICE DISPLAY
  ========================================================= */

  function PriceDisplay({ item, compact = false }) {
    if (isOnSale(item)) {
      return (
        <div className={compact ? "mt-1" : "mt-4"}>

          <div
            className={
              compact
                ? "text-red-500 font-bold"
                : "text-red-500 font-bold text-xl"
            }
          >
            SALE {formatPrice(item.sale_price)}
          </div>


          <div className="line-through text-gray-400">
            Regular {formatPrice(item.regular_price)}
          </div>


          <div className="text-sm text-gray-400 mt-1">
            Valid Until {formatDate(item.sale_end_date)}
          </div>

        </div>
      );
    }


    return (
      <div
        className={
          compact
            ? "font-bold text-lg mt-1"
            : "font-bold text-3xl my-3"
        }
      >
        {formatPrice(item.regular_price)}
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
        <div className="flex flex-col sm:flex-row gap-3 mt-4">

          <button
            className="
              flex-1
              bg-blue-600
              hover:bg-blue-700
              border
              border-blue-800
              py-3
              px-4
              rounded-xl
              text-white
              font-semibold
              transition
            "
            onClick={() => saveForComparison(item)}
          >
            Save for Comparison
          </button>


          <button
            className="
              flex-1
              bg-green-600
              hover:bg-green-700
              border
              border-green-800
              py-3
              px-4
              rounded-xl
              text-white
              font-semibold
              transition
            "
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
      <div className="flex flex-col sm:flex-row gap-3 mt-4">

        <button
          className="
            flex-1
            bg-blue-600
            hover:bg-blue-700
            py-3
            px-4
            rounded-xl
            text-white
            font-semibold
            transition
          "
          onClick={() => handleSelect(item)}
        >
          Use This
        </button>


        <button
          className="
            flex-1
            bg-green-600
            hover:bg-green-700
            py-3
            px-4
            rounded-xl
            text-white
            font-semibold
            transition
          "
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
    <div className="
      fixed
      inset-0
      z-[9999]
      bg-black/80
      flex
      items-center
      justify-center
      p-4
    ">

      <div
        className={`
          bg-[#202020]
          text-white
          rounded-2xl
          shadow-2xl
          border
          border-[#555555]
          w-full
          max-h-[95vh]
          overflow-y-auto
          p-5
          ${
            mode === "price"
              ? "max-w-6xl"
              : "max-w-xl"
          }
        `}
      >

        {/* =====================================================
            HEADER
        ===================================================== */}

        <div className="flex items-center justify-between gap-4 mb-5">

          <h2 className="text-3xl font-bold text-blue-400">
            💲 Price Checker
          </h2>


          <button
            className="
              shrink-0
              bg-gray-600
              hover:bg-gray-700
              text-white
              w-11
              h-11
              rounded-xl
              font-bold
              text-xl
              transition
            "
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
          className={
            mode === "price"
              ? "grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6"
              : "block"
          }
        >

          {/* ===================================================
              LEFT SIDE - SEARCH / RESULT
          =================================================== */}

          <div className="min-w-0">

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
              className="
                w-full
                bg-[#3A3A3A]
                border
                border-[#888888]
                text-white
                placeholder:text-[#AAB7CA]
                p-4
                text-lg
                outline-none
                focus:border-white
              "
            />


            {/* SEARCH + CAMERA BUTTONS */}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">

              <button
                className="
                  w-full
                  py-3
                  px-4
                  bg-blue-600
                  hover:bg-blue-700
                  disabled:bg-blue-900
                  disabled:text-gray-400
                  rounded-xl
                  font-semibold
                  transition
                "
                onClick={manualSearch}
                disabled={loading}
              >
                {loading
                  ? "Searching..."
                  : "Search"}
              </button>


              <button
                className="
                  w-full
                  py-3
                  px-4
                  bg-green-600
                  hover:bg-green-700
                  rounded-xl
                  font-semibold
                  transition
                "
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
              <div className="
                w-full
                h-64
                mt-4
                overflow-hidden
                rounded-xl
                border-2
                border-[#666666]
                bg-black
              ">

                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="
                    w-full
                    h-full
                    object-cover
                  "
                />

              </div>
            )}


            {/* =================================================
                RESULT AREA
            ================================================= */}

            <div className="
              mt-5
              border
              border-[#555555]
              bg-[#181818]
              rounded-xl
              p-4
              min-h-28
            ">

              {!result && !loading && (
                <div className="
                  text-gray-400
                  text-center
                  py-5
                ">
                  Scan a sample or search by product name.
                </div>
              )}


              {loading && (
                <div className="
                  text-center
                  py-5
                  text-lg
                  font-semibold
                ">
                  Checking price...
                </div>
              )}


              {/* ERROR */}

              {result?.type === "error" && (
                <div className="text-center">

                  <div className="
                    text-red-400
                    font-semibold
                    text-lg
                  ">
                    {result.message}
                  </div>


                  <button
                    className="
                      mt-4
                      bg-gray-600
                      hover:bg-gray-700
                      text-white
                      px-6
                      py-3
                      rounded-xl
                      font-semibold
                    "
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

                  <div className="text-center">

                    <div className="
                      text-2xl
                      font-bold
                    ">
                      {result.item.sample_name}
                    </div>


                    {result.item.variant_name &&
                      result.item.variant_name !== "Standard" && (
                        <div className="
                          text-xl
                          mt-1
                        ">
                          {result.item.variant_name}
                        </div>
                      )}


                    {result.item.manufacturer && (
                      <div className="
                        text-gray-400
                        mt-1
                      ">
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
                    <div className="
                      text-center
                      mb-4
                    ">

                      <div className="
                        text-2xl
                        font-bold
                      ">
                        {result.sample.sample_name}
                      </div>


                      {result.sample.manufacturer && (
                        <div className="
                          text-gray-400
                          mt-1
                        ">
                          {result.sample.manufacturer}
                        </div>
                      )}

                    </div>
                  )}


                  <div className="
                    font-semibold
                    text-lg
                    mb-3
                  ">
                    Select a price:
                  </div>


                  <div className="space-y-3">

                    {result.items.map((item) => (

                      <div
                        key={`${item.barcode}-${item.variant_code}`}
                        className="
                          border
                          border-[#555555]
                          bg-[#282828]
                          rounded-xl
                          p-4
                        "
                      >

                        {/* NAME */}

                        <div className="
                          font-bold
                          text-lg
                        ">

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

                          <div className="
                            text-sm
                            text-gray-400
                            mt-1
                          ">

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
                            className="
                              w-full
                              mt-3
                              bg-blue-600
                              hover:bg-blue-700
                              text-white
                              px-4
                              py-3
                              rounded-xl
                              font-semibold
                              transition
                            "
                            onClick={() =>
                              saveForComparison(item)
                            }
                          >
                            Save for Comparison
                          </button>

                        ) : (

                          <button
                            className="
                              w-full
                              mt-3
                              bg-blue-600
                              hover:bg-blue-700
                              text-white
                              px-4
                              py-3
                              rounded-xl
                              font-semibold
                              transition
                            "
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
                    className="
                      w-full
                      mt-4
                      bg-gray-600
                      hover:bg-gray-700
                      text-white
                      py-3
                      rounded-xl
                      font-semibold
                    "
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

            <div className="
              min-w-0
              border
              border-[#555555]
              bg-[#181818]
              rounded-xl
              p-4
              lg:self-start
            ">

              {/* HEADER */}

              <div className="
                flex
                items-center
                justify-between
                gap-3
                mb-4
              ">

                <div>

                  <h3 className="
                    text-xl
                    font-bold
                  ">
                    Saved Comparison
                  </h3>


                  <div className="
                    text-sm
                    text-gray-400
                  ">
                    {savedItems.length}{" "}
                    {savedItems.length === 1
                      ? "sample"
                      : "samples"}
                  </div>

                </div>


                {savedItems.length > 0 && (
                  <button
                    className="
                      bg-red-700
                      hover:bg-red-800
                      text-white
                      px-3
                      py-2
                      rounded-lg
                      text-sm
                      font-semibold
                      transition
                    "
                    onClick={clearSavedItems}
                  >
                    Clear All
                  </button>
                )}

              </div>


              {/* EMPTY COMPARISON */}

              {savedItems.length === 0 && (
                <div className="
                  border
                  border-dashed
                  border-[#555555]
                  rounded-xl
                  p-6
                  text-center
                  text-gray-400
                ">

                  <div className="text-3xl mb-2">
                    🏷️
                  </div>

                  <div>
                    Saved samples will appear here.
                  </div>

                  <div className="
                    text-sm
                    mt-2
                  ">
                    Scan a product, then press
                    {" "}
                    <strong>
                      Save for Comparison
                    </strong>.
                  </div>

                </div>
              )}


              {/* SAVED ITEMS */}

              <div className="space-y-3">

                {savedItems.map((item) => (

                  <div
                    key={`${item.barcode}-${item.variant_code}`}
                    className="
                      border
                      border-[#555555]
                      bg-[#282828]
                      rounded-xl
                      p-4
                    "
                  >

                    <div className="
                      flex
                      justify-between
                      items-start
                      gap-3
                    ">

                      <div className="min-w-0">

                        <div className="
                          font-bold
                          text-lg
                          break-words
                        ">
                          {item.sample_name}
                        </div>


                        {item.variant_name &&
                          item.variant_name !== "Standard" && (

                            <div className="
                              text-gray-300
                            ">
                              {item.variant_name}
                            </div>
                          )}


                        {item.manufacturer && (
                          <div className="
                            text-sm
                            text-gray-400
                            mt-1
                          ">
                            {item.manufacturer}
                          </div>
                        )}

                      </div>


                      <button
                        className="
                          shrink-0
                          w-9
                          h-9
                          bg-red-700
                          hover:bg-red-800
                          text-white
                          rounded-lg
                          font-bold
                          transition
                        "
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

                      <div className="
                        text-sm
                        text-gray-400
                        mt-2
                      ">

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

        <div className="
          flex
          flex-col
          sm:flex-row
          gap-3
          mt-5
        ">

          <button
            className="
              flex-1
              py-3
              bg-blue-600
              hover:bg-blue-700
              rounded-xl
              font-semibold
              transition
            "
            onClick={openSpreadsheet}
          >
            Open Spreadsheet
          </button>


          <button
            className="
              flex-1
              py-3
              bg-gray-600
              hover:bg-gray-700
              rounded-xl
              font-semibold
              transition
            "
            onClick={onClose}
          >
            Close
          </button>

        </div>

      </div>

    </div>
  );
}
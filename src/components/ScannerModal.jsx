import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";


const SHEET_VIEW_URL =
  "https://docs.google.com/spreadsheets/d/1VMPWmQUbbHK0JE_8ldfsc2G454vVPkFnLhjATuVKil8/edit?gid=0#gid=0";


export default function ScannerModal({ onClose, onSelect }) {
  const videoRef = useRef(null);
  const searchInputRef = useRef(null);

  // Stops the camera from reading the same barcode several times
  // before React has time to update its state.
  const scanLockRef = useRef(false);

  const [scanLocked, setScanLocked] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  const [result, setResult] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);


  /* =========================================================
     INITIAL FOCUS
  ========================================================= */

  useEffect(() => {
    // When the price checker opens, immediately focus the
    // search box so a physical barcode scanner can type into it.
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

    /*
      Because Supabase dates use YYYY-MM-DD, these strings can
      safely be compared directly.

      Example:

      2026-09-15 <= 2026-09-30
    */
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

    /*
      Adding T00:00:00 prevents JavaScript from treating the
      Supabase date as UTC and potentially displaying the
      previous calendar day.
    */
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
     LOOK UP ONE BARCODE
  ========================================================= */

  async function getSampleByBarcode(code) {
    const cleanCode = String(code).trim();


    /*
      FIRST:
      Find the physical sample itself.

      Samples.active controls whether the ENTIRE sample is active.
    */
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


    /*
      SECOND:
      Get every ACTIVE price variant belonging to the barcode.

      Having the same barcode multiple times here is intentional.
    */
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


    // Immediately lock scanning.
    scanLockRef.current = true;

    setScanLocked(true);
    setLoading(true);
    setResult(null);


    /*
      If this lookup came from the phone camera, close the
      camera after we successfully detected a barcode.
    */
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


      /*
        ONE PRICE VARIANT
      */
      if (data.variants.length === 1) {
        const item = {
          ...data.variants[0],

          /*
            Samples is the authoritative source for these values,
            so put its information over the duplicated variant data.
          */
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


      /*
        MULTIPLE PRICE VARIANTS
      */
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
     CAMERA SCANNER
  ========================================================= */

  useEffect(() => {
    /*
      The camera DOES NOT start until cameraOpen becomes true.
    */
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


    /*
      When cameraOpen becomes false OR ScannerModal closes,
      ZXing releases the phone/tablet camera.
    */
    return () => {
      cancelled = true;

      if (reader) {
        reader.reset();
      }
    };

  }, [cameraOpen]);


  /* =========================================================
     MANUAL / PHYSICAL SCANNER SEARCH
  ========================================================= */

  async function manualSearch() {
    const q = search.trim();

    if (!q || loading) return;


    /*
      Barcodes are numeric.

      Your physical barcode scanner behaves like a keyboard:
          types 01010101
          presses Enter

      Enter calls this function, which recognizes that it is
      numeric and performs the barcode lookup.
    */
    if (/^\d+$/.test(q)) {
      await lookupBarcode(q);
      return;
    }


    /*
      Otherwise treat the input as a product-name search.
    */
    scanLockRef.current = true;

    setScanLocked(true);
    setLoading(true);
    setResult(null);


    try {
      /*
        Search the main Samples catalog.
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
        ALSO search the pricing table.

        This is useful for variants.

        Example:

        Main Samples table:
            Sap

        Variant:
            Platinum

        Searching "Platinum" can still find it.
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


      /*
        Combine all barcodes found through either search.
      */
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


      /*
        Get authoritative Samples information for every barcode.
      */
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


      /*
        Get active pricing for all matching samples.
      */
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
        const sampleNameMatched = sample.sample_name
          ?.toLowerCase()
          .includes(q.toLowerCase());


        let relevantVariants = (allVariants || []).filter(
          (variant) => variant.barcode === sample.barcode
        );


        /*
          If the actual sample name matched the search,
          show ALL of its variants.

          Example:
              search "Sap"

          Result:
              Platinum
              Gold
              Silver
        */
        if (!sampleNameMatched) {
          /*
            Otherwise the match probably came from a variant name.

            Example:
                search "Platinum"

            Only show matching variants.
          */
          relevantVariants = relevantVariants.filter((variant) => {
            const variantSampleName =
              variant.sample_name?.toLowerCase() || "";

            const variantName =
              variant.variant_name?.toLowerCase() || "";

            const query = q.toLowerCase();


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


    /*
      Wait until React has cleared the input, then put focus
      back into it.

      This lets the employee immediately scan another sample.
    */
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
  }


  /* =========================================================
     SELECT ITEM
  ========================================================= */

  function handleSelect(item) {
    const currentPrice = getCurrentPrice(item);
    const onSale = isOnSale(item);


    /*
      Keep all of the new structured Supabase data.
    */
    const selectedItem = {
      ...item,

      current_price: currentPrice,
      on_sale: onSale,


      /*
        ALSO provide the old fields your existing calculators
        may already expect.

        This lets us change the backend without immediately
        having to rewrite every other component.
      */
      "Item Name": getDisplayName(item),
      "Price": formatPrice(currentPrice),
    };


    onSelect(selectedItem);
    onClose();
  }


  /* =========================================================
     OLD SPREADSHEET BUTTON
     You said you want to leave this for now.
  ========================================================= */

  function openSpreadsheet() {
    window.open(SHEET_VIEW_URL, "_blank");
  }


  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999]">

      <div style={styles.modal}>

        {/* ================= TITLE ================= */}

        <h2 className="text-3xl font-bold text-center text-blue-600 mb-4">
          <span className="mr-2">💲</span>
          Price Checker
          <span className="ml-2">💲</span>
        </h2>


        {/* ================= SEARCH ================= */}

        <input
          ref={searchInputRef}
          autoFocus
          placeholder="Scan barcode or enter product name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              manualSearch();
            }
          }}
          className="
            w-full
            p-3
            text-lg
            border-2
            border-gray-300
            rounded-xl
            focus:outline-none
            focus:border-blue-500
          "
        />


        <button
          className="
            w-full
            mt-3
            py-3
            text-lg
            bg-blue-600
            hover:bg-blue-700
            disabled:bg-blue-400
            border
            border-blue-800
            rounded-xl
            shadow-md
            font-semibold
            text-white
            transition
          "
          onClick={manualSearch}
          disabled={loading}
        >
          {loading ? "Searching..." : "Search"}
        </button>


        {/* ================= CAMERA BUTTON ================= */}

        <button
          className="
            w-full
            mt-3
            py-3
            text-lg
            bg-green-600
            hover:bg-green-700
            border
            border-green-800
            rounded-xl
            shadow-md
            font-semibold
            text-white
            transition
          "
          onClick={() => {
            /*
              If we're opening the camera after an old result,
              clear the scanner lock first.
            */
            if (!cameraOpen) {
              scanLockRef.current = false;
              setScanLocked(false);
              setResult(null);
            }

            setCameraOpen((current) => !current);
          }}
        >
          {cameraOpen ? "Close Camera" : "📷 Use Camera"}
        </button>


        {/* ================= CAMERA ================= */}

        {cameraOpen && (
          <div style={styles.videoBox}>
            <video
              ref={videoRef}
              style={styles.video}
              autoPlay
              muted
              playsInline
            />
          </div>
        )}


        {/* ================= RESULTS ================= */}

        <div style={styles.resultBox}>

          {!result && !loading && (
            <div className="text-gray-600">
              Waiting for scan…
            </div>
          )}


          {loading && (
            <div className="text-lg font-semibold">
              Checking price…
            </div>
          )}


          {/* ================= ERROR ================= */}

          {result?.type === "error" && (
            <>
              <div className="font-semibold text-red-600">
                {result.message}
              </div>


              <button
                className="
                  w-full
                  mt-3
                  py-2
                  bg-gray-600
                  hover:bg-gray-700
                  rounded-lg
                  text-white
                  font-semibold
                "
                onClick={unlock}
              >
                Try Again
              </button>
            </>
          )}


          {/* ================= SINGLE RESULT ================= */}

          {result?.type === "single" && (
            <>
              <div className="text-2xl font-semibold">
                {result.item.sample_name}
              </div>


              {result.item.variant_name &&
                result.item.variant_name !== "Standard" && (
                  <div className="text-xl mt-1">
                    {result.item.variant_name}
                  </div>
                )}


              {result.item.manufacturer && (
                <div className="text-gray-600 mt-1">
                  {result.item.manufacturer}
                </div>
              )}


              {/* SALE */}

              {isOnSale(result.item) ? (
                <div className="mt-4">

                  <div className="text-red-600 font-bold text-xl">
                    SALE
                  </div>


                  <div style={styles.price}>
                    {formatPrice(result.item.sale_price)}
                  </div>


                  <div className="line-through text-gray-500 text-lg">
                    Regular{" "}
                    {formatPrice(result.item.regular_price)}
                  </div>


                  <div className="mt-2 text-sm">
                    Valid Until{" "}
                    {formatDate(result.item.sale_end_date)}
                  </div>

                </div>
              ) : (

                /* REGULAR PRICE */

                <div style={styles.price}>
                  {formatPrice(result.item.regular_price)}
                </div>
              )}


              <div className="flex gap-4 mt-4">

                <button
                  className="
                    flex-1
                    bg-blue-600
                    hover:bg-blue-700
                    border
                    border-blue-800
                    py-3
                    rounded-xl
                    shadow-xl
                    text-white
                    font-semibold
                    transition
                  "
                  onClick={() => handleSelect(result.item)}
                >
                  Use This
                </button>


                <button
                  className="
                    flex-1
                    bg-green-600
                    hover:bg-green-700
                    border
                    border-green-800
                    py-3
                    rounded-xl
                    shadow-xl
                    text-white
                    font-semibold
                    transition
                  "
                  onClick={unlock}
                >
                  Scan Next
                </button>

              </div>
            </>
          )}


          {/* ================= MULTIPLE RESULTS ================= */}

          {result?.type === "multiple" && (
            <>

              {result.sample && (
                <>
                  <div className="text-2xl font-semibold">
                    {result.sample.sample_name}
                  </div>


                  {result.sample.manufacturer && (
                    <div className="text-gray-600 mb-3">
                      {result.sample.manufacturer}
                    </div>
                  )}
                </>
              )}


              <div className="font-semibold text-lg mt-2">
                Select item:
              </div>


              {result.items.map((item) => (
                <div
                  key={`${item.barcode}-${item.variant_code}`}
                  style={styles.variant}
                >

                  {/* PRODUCT / VARIANT NAME */}

                  <div className="font-semibold text-lg">

                    {result.sample
                      ? (
                          item.variant_name === "Standard"
                            ? "Standard"
                            : item.variant_name
                        )
                      : getDisplayName(item)
                    }

                  </div>


                  {/* EXTRA VARIANT DETAILS */}

                  {(item.grade ||
                    item.construction ||
                    item.thickness ||
                    item.width) && (

                    <div className="text-sm text-gray-600 mt-1">

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


                  {/* SALE PRICE */}

                  {isOnSale(item) ? (
                    <div className="mt-2">

                      <div className="text-red-600 font-bold text-lg">
                        SALE {formatPrice(item.sale_price)}
                      </div>


                      <div className="line-through text-gray-500">
                        Regular {formatPrice(item.regular_price)}
                      </div>


                      <div className="text-sm mt-1">
                        Valid Until{" "}
                        {formatDate(item.sale_end_date)}
                      </div>

                    </div>
                  ) : (

                    /* REGULAR PRICE */

                    <div className="text-xl mt-2 font-semibold">
                      {formatPrice(item.regular_price)}
                    </div>
                  )}


                  <button
                    className="
                      w-full
                      mt-3
                      py-2
                      bg-blue-600
                      hover:bg-blue-700
                      text-white
                      rounded-lg
                      font-semibold
                    "
                    onClick={() => handleSelect(item)}
                  >
                    Select
                  </button>

                </div>
              ))}


              <button
                className="
                  w-full
                  mt-3
                  py-2
                  bg-gray-600
                  hover:bg-gray-700
                  rounded-lg
                  text-white
                  font-semibold
                "
                onClick={unlock}
              >
                Cancel
              </button>

            </>
          )}

        </div>


        {/* ================= OLD SPREADSHEET BUTTON ================= */}

        <button
          className="
            w-full
            mt-3
            py-3
            text-lg
            bg-blue-600
            hover:bg-blue-700
            border
            border-blue-800
            rounded-xl
            shadow-md
            font-semibold
            text-white
            transition
          "
          onClick={openSpreadsheet}
        >
          Open Spreadsheet
        </button>


        {/* ================= CLOSE ================= */}

        <button
          className="
            w-full
            mt-3
            py-3
            text-lg
            bg-gray-600
            hover:bg-gray-700
            border
            border-gray-800
            rounded-xl
            shadow-md
            font-semibold
            text-white
            transition
          "
          onClick={onClose}
        >
          Close
        </button>

      </div>
    </div>
  );
}


/* =========================================================
   STYLES
========================================================= */

const styles = {

  modal: {
    background: "#fff",
    padding: 20,
    borderRadius: 16,
    width: "90%",
    maxWidth: 600,
    textAlign: "center",

    /*
      Important for phones and for products with a lot of
      variants. The modal will scroll rather than extend
      off-screen.
    */
    maxHeight: "95vh",
    overflowY: "auto",
  },


  videoBox: {
    width: "100%",
    height: 250,
    overflow: "hidden",
    borderRadius: 12,
    border: "3px solid #222",
    marginTop: 12,
    marginBottom: 10,
  },


  video: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },


  resultBox: {
    marginTop: 15,
    padding: 15,
    border: "2px solid #333",
    borderRadius: 12,
  },


  variant: {
    border: "1px solid #333",
    padding: 12,
    marginTop: 10,
    borderRadius: 10,
  },


  price: {
    fontSize: 28,
    fontWeight: "bold",
    margin: "10px 0",
  },

};
import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";


const SHEET_VIEW_URL =
  "https://docs.google.com/spreadsheets/d/1VMPWmQUbbHK0JE_8ldfsc2G454vVPkFnLhjATuVKil8/edit?gid=0#gid=0";


export default function ScannerModal({ onClose, onSelect }) {
  const videoRef = useRef(null);

  // This ref immediately prevents the barcode scanner from firing
  // several times before React has time to update the state.
  const scanLockRef = useRef(false);

  const [scanLocked, setScanLocked] = useState(false);
  const [result, setResult] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);


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
      item.sale_price === "" ||
      !item.sale_end_date
    ) {
      return false;
    }

    return item.sale_end_date >= getTodayString();
  }


  function getCurrentPrice(item) {
    if (isOnSale(item)) {
      return Number(item.sale_price);
    }

    return Number(item.regular_price);
  }


  function formatPrice(price) {
    if (price === null || price === undefined || price === "") {
      return "Price unavailable";
    }

    return `$${Number(price).toFixed(2)}/sqft`;
  }


  function formatDate(dateString) {
    if (!dateString) return "";

    // Adding T00:00:00 keeps this as a local calendar date rather
    // than potentially shifting a day because of UTC conversion.
    const date = new Date(`${dateString}T00:00:00`);

    return date.toLocaleDateString("en-CA", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }


  /* =========================================================
     SUPABASE LOOKUP
  ========================================================= */

  async function getSampleByBarcode(code) {
    const cleanCode = code.trim();

    /*
      First get the actual physical sample.

      This also lets Samples.active control the WHOLE product.
    */
    const { data: sample, error: sampleError } = await supabase
      .from("Samples")
      .select(`
        barcode,
        sample_name,
        manufacturer,
        product_type,
        installation_type,
        active
      `)
      .eq("barcode", cleanCode)
      .eq("active", true)
      .maybeSingle();

    if (sampleError) {
      throw sampleError;
    }

    if (!sample) {
      return null;
    }


    /*
      Now get all active prices/variants belonging to that sample.
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
      throw variantError;
    }


    return {
      sample,
      variants: variants || [],
    };
  }


  /* =========================================================
     BARCODE LOOKUP
  ========================================================= */

  async function lookupBarcode(code) {
    if (!code) return;

    scanLockRef.current = true;
    setScanLocked(true);
    setLoading(true);
    setResult(null);

    try {
      const data = await getSampleByBarcode(code);

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
          message: "Sample found, but no active pricing was found.",
        });

        return;
      }


      if (data.variants.length === 1) {
        setResult({
          type: "single",
          sample: data.sample,
          item: {
            ...data.variants[0],
            ...data.sample,
          },
        });
      } else {
        setResult({
          type: "multiple",
          sample: data.sample,
          items: data.variants.map((variant) => ({
            ...variant,
            ...data.sample,
          })),
        });
      }

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
    if (!videoRef.current) return;

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
            if (res && !scanLockRef.current) {
              lookupBarcode(res.text);
            }
          }
        );

      } catch (error) {
        console.error("Scanner error:", error);
      }
    }

    startScanner();

    return () => {
      cancelled = true;

      if (reader) {
        reader.reset();
      }
    };
  }, []);


  /* =========================================================
     MANUAL SEARCH
  ========================================================= */

  async function manualSearch() {
    const q = search.trim();

    if (!q) return;


    /*
      If they entered only numbers, assume they entered/scanned
      a barcode manually.
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
        Search the main Samples table by product name.

        Only active physical samples are returned.
      */
      const { data: samples, error: sampleError } = await supabase
        .from("Samples")
        .select(`
          barcode,
          sample_name,
          manufacturer,
          product_type,
          installation_type,
          active
        `)
        .eq("active", true)
        .ilike("sample_name", `%${q}%`)
        .limit(30);

      if (sampleError) {
        throw sampleError;
      }


      if (!samples || samples.length === 0) {
        setResult({
          type: "error",
          message: "No matches found.",
        });

        return;
      }


      const barcodes = samples.map((sample) => sample.barcode);


      /*
        Get the pricing variants belonging to all matching samples.
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
        .in("barcode", barcodes)
        .eq("active", true)
        .order("barcode", { ascending: true })
        .order("variant_code", { ascending: true });

      if (variantError) {
        throw variantError;
      }


      const items = [];

      samples.forEach((sample) => {
        const sampleVariants = (variants || []).filter(
          (variant) => variant.barcode === sample.barcode
        );

        sampleVariants.forEach((variant) => {
          items.push({
            ...variant,
            ...sample,
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
     BUTTON FUNCTIONS
  ========================================================= */

  function unlock() {
    scanLockRef.current = false;

    setScanLocked(false);
    setResult(null);
    setSearch("");
  }


  function handleSelect(item) {
    /*
      These two legacy fields are intentionally included.

      Your older components may still expect:
          item["Item Name"]
          item["Price"]

      This lets us transition to Supabase without immediately
      breaking those components.
    */

    const selectedItem = {
      ...item,

      current_price: getCurrentPrice(item),
      on_sale: isOnSale(item),

      "Item Name":
        item.variant_name &&
        item.variant_name !== "Standard"
          ? `${item.sample_name} - ${item.variant_name}`
          : item.sample_name,

      "Price": formatPrice(getCurrentPrice(item)),
    };

    onSelect(selectedItem);
    onClose();
  }


  const openSpreadsheet = () => {
    window.open(SHEET_VIEW_URL, "_blank");
  };


  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="fixed top-0 left-0 w-screen h-screen bg-black/80 flex items-center justify-center z-[9999]">

      <div style={styles.modal}>

        <h2 className="text-3xl font-bold text-center text-blue-600 mb-4">
          <span className="mr-2">💲</span>
          Price Checker
          <span className="ml-2">💲</span>
        </h2>


        <div style={styles.videoBox}>
          <video ref={videoRef} style={styles.video} />
        </div>


        <input
          placeholder="Enter barcode or product name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              manualSearch();
            }
          }}
          className="w-full p-3 text-lg mt-2 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-blue-500"
        />


        <button
          className="w-full mt-3 py-3 text-lg bg-blue-600 hover:bg-blue-700 border border-blue-800 rounded-xl shadow-md font-semibold text-white transition"
          onClick={manualSearch}
          disabled={loading}
        >
          {loading ? "Searching..." : "Search"}
        </button>


        <div style={styles.resultBox}>

          {!result && !loading && (
            <div>Waiting for scan…</div>
          )}


          {loading && (
            <div>Checking price…</div>
          )}


          {result?.type === "error" && (
            <>
              <div className="font-semibold">
                {result.message}
              </div>

              <button
                className="w-full mt-3 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg text-white"
                onClick={unlock}
              >
                Try Again
              </button>
            </>
          )}


          {result?.type === "single" && (
            <>
              <div className="text-xl font-semibold">
                {result.item.sample_name}
              </div>


              {result.item.variant_name !== "Standard" && (
                <div className="text-lg mt-1">
                  {result.item.variant_name}
                </div>
              )}


              <div className="text-gray-600 mt-1">
                {result.item.manufacturer}
              </div>


              {isOnSale(result.item) ? (
                <div className="mt-3">

                  <div className="text-red-600 font-bold text-lg">
                    SALE
                  </div>

                  <div style={styles.price}>
                    {formatPrice(result.item.sale_price)}
                  </div>

                  <div className="line-through text-gray-500">
                    Regular {formatPrice(result.item.regular_price)}
                  </div>

                  <div className="mt-1 text-sm">
                    Valid Until{" "}
                    {formatDate(result.item.sale_end_date)}
                  </div>

                </div>
              ) : (
                <div style={styles.price}>
                  {formatPrice(result.item.regular_price)}
                </div>
              )}


              <div className="flex gap-4 mt-4">

                <button
                  className="flex-1 bg-blue-600 hover:bg-blue-700 border border-blue-800 py-3 rounded-xl shadow-xl text-white font-semibold transition"
                  onClick={() => handleSelect(result.item)}
                >
                  Use This
                </button>

                <button
                  className="flex-1 bg-green-600 hover:bg-green-700 border border-green-800 py-3 rounded-xl shadow-xl text-white font-semibold transition"
                  onClick={unlock}
                >
                  Scan Next
                </button>

              </div>
            </>
          )}


          {result?.type === "multiple" && (
            <>
              {result.sample && (
                <div className="text-xl font-semibold mb-3">
                  {result.sample.sample_name}
                </div>
              )}

              <div className="font-semibold">
                Select item:
              </div>


              {result.items.map((item) => (
                <div
                  key={`${item.barcode}-${item.variant_code}`}
                  style={styles.variant}
                >

                  <div className="font-semibold text-lg">

                    {result.sample
                      ? item.variant_name
                      : (
                          item.variant_name === "Standard"
                            ? item.sample_name
                            : `${item.sample_name} - ${item.variant_name}`
                        )
                    }

                  </div>


                  {isOnSale(item) ? (
                    <>
                      <div className="text-red-600 font-bold mt-2">
                        SALE {formatPrice(item.sale_price)}
                      </div>

                      <div className="line-through text-gray-500">
                        {formatPrice(item.regular_price)}
                      </div>

                      <div className="text-sm">
                        Valid Until {formatDate(item.sale_end_date)}
                      </div>
                    </>
                  ) : (
                    <div className="text-xl mt-2">
                      {formatPrice(item.regular_price)}
                    </div>
                  )}


                  <button
                    className="w-full mt-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                    onClick={() => handleSelect(item)}
                  >
                    Select
                  </button>

                </div>
              ))}


              <button
                className="w-full mt-3 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg text-white"
                onClick={unlock}
              >
                Cancel
              </button>

            </>
          )}

        </div>


        <button
          className="w-full mt-3 py-3 text-lg bg-blue-600 hover:bg-blue-700 border border-blue-800 rounded-xl shadow-md font-semibold text-white transition"
          onClick={openSpreadsheet}
        >
          Open Spreadsheet
        </button>


        <button
          className="w-full mt-3 py-3 text-lg bg-gray-600 hover:bg-gray-700 border border-gray-800 rounded-xl shadow-md font-semibold text-white transition"
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
    maxHeight: "95vh",
    overflowY: "auto",
  },

  videoBox: {
    width: "100%",
    height: 250,
    overflow: "hidden",
    borderRadius: 12,
    border: "3px solid #222",
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
    padding: 10,
    marginTop: 10,
    borderRadius: 10,
  },

  price: {
    fontSize: 28,
    fontWeight: "bold",
    margin: "10px 0",
  },

};
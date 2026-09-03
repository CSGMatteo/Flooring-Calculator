export default async function handler(req, res) {
  /* =========================================================
     ONLY ALLOW POST
  ========================================================= */

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }

  /* =========================================================
     CHECK SYNC TOKEN
  ========================================================= */

  const syncToken = req.headers["x-sync-token"];

  if (
    !syncToken ||
    syncToken !== process.env.SUPABASE_SYNC_TOKEN
  ) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized",
    });
  }

  try {
    /* =========================================================
       LOAD SUPABASE INSIDE THE HANDLER
    ========================================================= */

    const { createClient } = await import("@supabase/supabase-js");

    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SECRET_KEY
    );

    const { type, rows } = req.body || {};

    if (!Array.isArray(rows)) {
      return res.status(400).json({
        success: false,
        error: "Rows must be an array",
      });
    }

    /* =========================================================
       SYNC SAMPLES
    ========================================================= */

    if (type === "samples") {
      const cleanedRows = rows
        .filter(
          (row) =>
            row.barcode &&
            row.sample_name
        )
        .map((row) => ({
          barcode: String(row.barcode).trim(),

          sample_name:
            String(row.sample_name).trim(),

          manufacturer:
            cleanText(row.manufacturer),

          product_type:
            cleanText(row.product_type),

          installation_type:
            cleanText(row.installation_type),

          quantity_owned:
            cleanInteger(row.quantity_owned),

          active:
            cleanBoolean(row.active, true),

          notes:
            cleanText(row.notes),
        }));

      if (cleanedRows.length === 0) {
        return res.status(400).json({
          success: false,
          error: "No valid sample rows found",
        });
      }

      const { data, error } = await supabase
        .from("Samples")
        .upsert(cleanedRows, {
          onConflict: "barcode",
        })
        .select(
          "id, barcode, sample_name"
        );

      if (error) {
        console.error(
          "SAMPLES UPSERT ERROR:",
          error
        );

        return res.status(500).json({
          success: false,
          error: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
      }

      return res.status(200).json({
        success: true,
        type: "samples",
        synced: cleanedRows.length,
        rows: data,
      });
    }

    /* =========================================================
       SYNC PRICE VARIANTS
    ========================================================= */

    if (type === "variants") {
      const cleanedRows = rows
        .filter(
          (row) =>
            row.barcode &&
            row.variant_code &&
            row.variant_name
        )
        .map((row) => ({
          barcode:
            String(row.barcode).trim(),

          sample_name:
            cleanText(row.sample_name),

          regular_price:
            cleanNumber(row.regular_price),

          sale_price:
            cleanNumber(row.sale_price),

          sale_end_date:
            cleanDate(row.sale_end_date),

          manufacturer:
            cleanText(row.manufacturer),

          variant_code:
            String(row.variant_code)
              .trim()
              .padStart(2, "0"),

          variant_name:
            String(row.variant_name).trim(),

          grade:
            cleanText(row.grade),

          construction:
            cleanText(row.construction),

          thickness:
            cleanText(row.thickness),

          width:
            cleanText(row.width),

          active:
            cleanBoolean(row.active, true),

          notes:
            cleanText(row.notes),
        }));

      if (cleanedRows.length === 0) {
        return res.status(400).json({
          success: false,
          error:
            "No valid pricing variant rows found",
        });
      }

      const { data, error } = await supabase
        .from("Sample_Variants")
        .upsert(cleanedRows, {
          onConflict:
            "barcode,variant_code",
        })
        .select(
          "id, barcode, variant_code, variant_name"
        );

      if (error) {
        console.error(
          "VARIANT UPSERT ERROR:",
          error
        );

        return res.status(500).json({
          success: false,
          error: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
      }

      return res.status(200).json({
        success: true,
        type: "variants",
        synced: cleanedRows.length,
        rows: data,
      });
    }

    /* =========================================================
       UNKNOWN TYPE
    ========================================================= */

    return res.status(400).json({
      success: false,
      error: `Invalid sync type: ${type}`,
    });
  } catch (error) {
    console.error(
      "SYNC FUNCTION ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "Unknown sync error",
    });
  }
}


/* =========================================================
   HELPERS
========================================================= */

function cleanText(value) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  ) {
    return null;
  }

  return String(value).trim();
}


function cleanNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}


function cleanInteger(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isInteger(number)
    ? number
    : null;
}


function cleanBoolean(
  value,
  defaultValue = true
) {
  if (
    value === true ||
    String(value).toUpperCase() === "TRUE"
  ) {
    return true;
  }

  if (
    value === false ||
    String(value).toUpperCase() === "FALSE"
  ) {
    return false;
  }

  return defaultValue;
}


function cleanDate(value) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  ) {
    return null;
  }

  return String(value)
    .trim()
    .substring(0, 10);
}
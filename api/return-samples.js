import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({
            success: false,
            error: "Method not allowed"
        });
    }

    try {
        const supabase = createClient(
            process.env.VITE_SUPABSE_URL,
            process.env.SUPABASE_SECRET_KEY,
            {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false
                }
            }
        );

        const { itemIds } = req.body || {};

        if (!Array.isArray(itemIds) || itemIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: "No samples were selected for return"
            });
        }

        const uniqueIds = [...new Set(itemIds)];

        const { data: activeItems, error: checkError } = await supabase
            .from("Signout_Items")
            .select("id")
            .in("id", uniqueIds)
            .is("returned_at", null);

        if (checkError) {
            throw checkError;
        }

        if (activeItems.length !== uniqueIds.length) {
            return res.status(409).json({
                success: false,
                error: "One or more samples already returned"
            });
        }

        const returnedAt = new Date().toISOString();

        const { data: returnedItems, error: returnError } = await supabase
            .from("Signout_Items")
            .update({
                returned_at: returnedAt
            })
            .in("id", uniqueIds)
            .is("returned_at", null)
            .select("id");

        if (returnError) {
            throw returnError;
        }

        return res.status(200).json({
            success: true,
            returnedCount: returnedItems.length,
            returnedAt
        });

    } catch (err) {
        console.error("RETURN SAMPLES ERROR:", err);

        return res.status(500).json({
            success: false,
            error: err.message || "Unknown server error"
        });
    }
}
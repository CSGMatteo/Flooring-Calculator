import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
    if (req.method !==  "GET") {
        return res.status(405).json({
            success: false,
            error: "Method not allowed"
        });
    }

    try {
        const supabase = createClient(
            process.env.VITE_SUPABASE_URL,
            process.env.SUPABASE_SECRET_KEY,
            {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false
                }
            }
        );

        const barcode = String(req.query.barcode || "").trim();

        if (!barcode) {
            return res.status(400).json({
                success: false,
                error: "Barcode is required"
            });
        }

        // Find EVERY active checkout using this barcode
        const { data: items, error: itemError } = await supabase
            .from("Signout_Items")
            .select(
                "id, signout_id, sample_id, barcode_snapshot, sample_name_snapshot, returned_at"
            )
            .eq("barcode_snapshot", barcode)
            .is("returned_at", null);

        if (itemError) {
            throw itemError;
        }

        if (!items || items.length === 0) {
            return res.status(404).json({
                success: false,
                error: "This sample is not currently signed out"
            });
        }

        // Get all related signout/customer records
        const signoutIds = [
            ...new Set(items.map(item => item.signout_id))
        ];

        const { data: signouts, error: signoutError } = await supabase
            .from("Signouts")
            .select(
                "id, customer_name, customer_phone, employee_name, signed_out_at"
            )
            .in("id", signoutIds);

        if (signoutError) {
            throw signoutError;
        }

        const signoutMap = new Map(
            signouts.map(signout => [signout.id, signout])
        );

        const result = items.map(item => {
            const signout = signoutMap.get(item.signout_id);

            return {
                ...item,
                customer_name: signout?.customer_name || "",
                customer_phone: signout?.customer_phone || "",
                employee_name: signout?.employee_name || "",
                signed_out_at: signout?.signed_out_at || null
            };
        })

        return res.status(200).json({
            success: true,
            items: result
        });

    } catch (err) {
        console.error("FIND ACTIVE SAMPLE ERROR:", err);

        return res.status(500).json({
            success: false,
            error: err.message || "Unknown server error"
        });
    }
}
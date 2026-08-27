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

        const { data: items, error: itemError } = await supabase
            .from("Signout_Items")
            .select(
                "id, signout_id, sample_id, barcode_snapshot, sample_name_snapshot, returned_at"
            )
            .eq("barcode_snapshot", barcode)
            .is("returned_at", null)
            .limit(2);

        if (itemError) {
            throw itemError;
        }

        if (!items || items.length === 0) {
            return res.status(404).json({
                success: false,
                error: "This sample is not currently signed out"
            });
        }

        if (items.length > 1) {
            return res.status(409).json({
                success: false,
                error: "Multiple active sign-outs were found for this barcode"
            });
        }

        const item = items[0];

        const { data: signout, error: signoutError } = await supabase
            .from("Signouts")
            .select(
                "id, customer_name, customer_phone, employee_name, signed_out_at"
            )
            .eq("id", item.signout_id)
            .single();

        if (signoutError) {
            throw signoutError;
        }

        return res.status(200).json({
            success: true,
            item: {
                ...item,
                customer_name: signout.customer_name,
                customer_phone: signout.customer_phone,
                employee_name: signout.employee_name,
                signed_out_at: signout.signed_out_at
            }
        });

    } catch (err) {
        console.error("FIND ACTIVE SAMPLE ERROR:", err);

        return res.status(500).json({
            success: false,
            error: err.message || "Unknown server error"
        });
    }
}
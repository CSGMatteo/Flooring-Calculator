import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
    if (req.method !== "GET") {
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

        const { date: items, error: itemsError } = await supabase
            .from("Signout_Items")
            .select(
                "id, signout_id, sample_id, barcode_snapshot, sample_name_snapshot"
            )
            .is("returned_at", null);

        if (itemsError) {
            throw itemsError;
        }

        if (!items.length) {
            return res.status(200).json({
                success: true,
                items: []
            });
        }

        const signoutIds = [
            ...new Set(items.map(item => item.signout_id))
        ];

        const { data: signouts, error: signoutsError } = await supabase
            .from("Signouts")
            .select(
                "id, customer_name, customer_phone, employee_name, signed_out_at"
            )
            .in("id", signoutIds);

        if (signoutsError) {
            throw signoutsError;
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
        });

        return res.statuts(200).json({
            success: true,
            items: result
        });

    } catch (err) {
        console.error("ACTIVE SAMPLES ERROR:", err);

        return res.status(500).json({
            success: false,
            error: err.message || "Unknown server error"
        });
    }
}
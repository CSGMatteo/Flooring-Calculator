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

        const query = String(req.query.query || "").trim();

        if (!query) {
            return res.status(400).json({
                success: false,
                error: "Customer name is required"
            });
        }

        // Find signouts matching the customer's name
        const { data: signouts, error: signoutError } = await supabase
            .from("Signouts")
            .select(
                "id, customer_name, customer_phone, employee_name, signed_out_at"
            )
            .ilike("customer_name", `%${query}%`)
            .order("signed_out_at", {
                ascending: false
            })
            .limit(100);

        if (signoutError) {
            throw signoutError;
        }

        if (!signouts || signouts.length === 0) {
            return res.status(200).json({
                success: true,
                customers: []
            });
        }

        const signoutIds = signouts.map(
            signout => signout.id
        );

        // Only retrieve samples that are STILL OUT
        const { data: items, error: itemError } = await supabase
            .from("Signout_Items")
            .select(
                "id, signout_id, sample_id, barcode_snapshot, sample_name_snapshot"
            )
            .in("signout_id", signoutIds)
            .is("returned_at", null);

        if (itemError) {
            throw itemError;
        }

        // Organize active items by signout
        const itemsBySignout = new Map();

        for (const item of items) {
            if (!itemsBySignout.has(item.signout_id)) {
                itemsBySignout.set(
                    item.signout_id,
                    []
                );
            }

            itemsBySignout
                .get(item.signout_id)
                .push(item);
        }

        // Group multiple signouts belonging to the same customer together
        const customerMap = new Map();

        for (const signout of signouts) {
            const activeItems = 
                itemsBySignout.get(signout.id) || [];
            
            // Customer has nothing currently out from this transaction
            if (!activeItems.length) {
                continue;
            }

            const customerKey =
                `${signout.customer_name.toLowerCase()}|${signout.customer_phone}`;
            
            if (!customerMap.has(customerKey)) {
                customerMap.set(customerKey, {
                    customer_name:
                        signout.customer_name,
                    customer_phone:
                        signout.customer_phone,
                    items: []
                });
            }

            const customer =
                customerMap.get(customerKey);
            
            for (const item of activeItems) {
                customer.items.push({
                    ...item,
                    employee_name:
                        signout.employee_name,
                    signed_out_at:
                        signout.signed_out_at
                });
            }
        }

        return res.status(200).json({
            success: true,
            customers: Array.from(
                customerMap.values()
            )
        });

    } catch (err) {
        console.error(
            "CUSTOMER RETURN SEARCH ERROR:",
            err
        );

        return res.status(500).json({
            success: false,
            error:
                err.message ||
                "Unknown server error"
        });
    }
}
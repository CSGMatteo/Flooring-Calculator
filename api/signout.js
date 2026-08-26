import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {

    // Only allow POST requests
    if (req.method !== "POST") {
        return res.status(405).json({
            success: false,
            error: "Method not allowed"
        });
    }

    try {
        const supabaseUrl = process.env.VITE_SUPABASE_URL;
        const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

        if (!supabaseUrl) {
            throw new Error("VITE_SUPABASE_URL is missing");
        }

        if (!supabaseSecretKey) {
            throw new Error("SUPABASE_SECRET_KEY is missing");
        }

        const supabaseAdmin = createClient(
            supabaseUrl,
            supabaseSecretKey,
            {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false
                }
            }
        );
        
        const { customerInfo, items } = req.body || {};

        // -------------------------
        // Validate customer details
        // -------------------------

        const customerName = customerInfo?.name?.trim();
        const customerPhone = customerInfo?.number?.trim();
        const employeeName = customerInfo?.employee?.trim();

        if (!customerName || !customerPhone || !employeeName) {
            return res.status(400).json({
                success: false,
                error: "Missing customer or employee informtion"
            });
        }

        // -------------------------
        // Validate cart
        // -------------------------

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                error: "No samples were supplied"
            });
        }

        // -------------------------
        // Create the signout
        // -------------------------

        const { data: signout, error: signoutError } = await supabaseAdmin
            .from("Signouts")
            .insert({
                customer_name: customerName,
                customer_phone: customerPhone,
                employee_name: employeeName
            })
            .select("id")
            .single();
        
        if (signoutError) {
            console.error("SIGNOUT INSERT ERROR:", signoutError);
            throw signoutError;
        }

        // -------------------------
        // Prepare each cart item
        // -------------------------

        const signoutItems = items.map(item => {

            const isUnlisted =
                item.is_unlisted === true ||
                String(item.id).startsWith("misc-")

            return {
                signout_id: signout.id,

                // Unlisted sample don't exist in Samples
                sample_id: isUnlisted ? null : item.id,

                barcode_snapshot:
                    item.barcode || "UNLISTED",
                
                sample_name_snapshot:
                    item.sample_name
            };
        });

        // -------------------------
        // Save all sample items
        // -------------------------

        const { error: itemsError } = await supabaseAdmin
            .from("Signout_Items")
            .insert(signoutItems);
        
        if (itemsError) {
            console.error("SIGNOUT ITEMS ERROR:", itemsError);

            // Remove the parent signout if its items failed
            await supabaseAdmin
                .from("Signouts")
                .delete()
                .eq("id", signout.id);

            throw itemsError;
        }

        // -------------------------
        // Finished Successfully
        // -------------------------

        return res.status(200).json({
            success: true,
            signoutId: signout.id
        });

    } catch (err) {

        console.error("SINGOUT API ERROR:", err);

        return res.status(500).json({
            success: false,
            error: err.message || "Unknown server error"
        });
    }
}
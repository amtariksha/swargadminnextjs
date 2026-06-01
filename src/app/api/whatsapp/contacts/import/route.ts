import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";

interface ImportContact {
    phone: string;
    name?: string;
    email?: string;
    tags?: string;
}

// ─── POST /api/contacts/import ─────────────────────────────
// Bulk import contacts from CSV data (parsed on client, sent as JSON)
export async function POST(request: NextRequest) {
    const body = await request.json();
    const contacts: ImportContact[] = body.contacts;

    if (!Array.isArray(contacts) || contacts.length === 0) {
        return NextResponse.json(
            { error: "No contacts provided" },
            { status: 400 }
        );
    }

    if (contacts.length > 5000) {
        return NextResponse.json(
            { error: "Maximum 5000 contacts per import" },
            { status: 400 }
        );
    }

    // Get existing phones to detect duplicates
    const { data: existingContacts } = await supabaseAdmin
        .from("contacts")
        .select("phone");

    const existingPhones = new Set(
        (existingContacts || []).map((c) => c.phone)
    );

    let imported = 0;
    let skipped = 0;
    const errors: { row: number; phone: string; message: string }[] = [];
    const seenPhones = new Set<string>();

    for (let i = 0; i < contacts.length; i++) {
        const row = contacts[i];

        // Clean phone: remove +, spaces, dashes
        const phone = (row.phone || "")
            .toString()
            .replace(/[\s\-\+\(\)]/g, "")
            .trim();

        if (!phone) {
            errors.push({ row: i + 1, phone: row.phone || "", message: "Phone number is required" });
            continue;
        }

        if (phone.length < 7 || phone.length > 15) {
            errors.push({ row: i + 1, phone, message: "Invalid phone number length" });
            continue;
        }

        // Skip duplicates within the import batch
        if (seenPhones.has(phone)) {
            skipped++;
            continue;
        }
        seenPhones.add(phone);

        // Skip if contact already exists
        if (existingPhones.has(phone)) {
            skipped++;
            continue;
        }

        // Parse tags: comma-separated string → array
        let tags: string[] = [];
        if (row.tags) {
            tags = row.tags
                .toString()
                .split(",")
                .map((t: string) => t.trim())
                .filter(Boolean);
        }

        const { error } = await supabaseAdmin.from("contacts").insert({
            name: (row.name || "").trim() || "Unknown",
            phone,
            email: (row.email || "").trim() || null,
            tags,
        });

        if (error) {
            if (error.code === "23505") {
                // Unique constraint violation — already exists
                skipped++;
            } else {
                errors.push({ row: i + 1, phone, message: error.message });
            }
        } else {
            imported++;
        }
    }

    return NextResponse.json({
        imported,
        skipped,
        errors: errors.slice(0, 50), // Limit error details to first 50
        total: contacts.length,
    });
}

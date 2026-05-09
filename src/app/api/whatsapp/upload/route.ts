import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";

const MAX_FILE_SIZE = 16 * 1024 * 1024; // 16 MB
const ALLOWED_TYPES: Record<string, string[]> = {
    image: ["image/jpeg", "image/png", "image/webp"],
    video: ["video/mp4", "video/3gpp"],
    document: [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
};

// ─── POST /api/upload ────────────────────────────────────────
// Upload a file to Supabase Storage (template-media bucket)
export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const mediaType = formData.get("type") as string | null; // image | video | document

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
                { status: 400 }
            );
        }

        // Validate file type if mediaType is provided
        if (mediaType && ALLOWED_TYPES[mediaType]) {
            if (!ALLOWED_TYPES[mediaType].includes(file.type)) {
                return NextResponse.json(
                    { error: `Invalid file type '${file.type}' for ${mediaType}. Allowed: ${ALLOWED_TYPES[mediaType].join(", ")}` },
                    { status: 400 }
                );
            }
        }

        // Generate a unique file path
        const ext = file.name.split(".").pop() || "bin";
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const filePath = `templates/${fileName}`;

        // Read file into buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Upload to Supabase Storage
        const { error: uploadError } = await supabaseAdmin.storage
            .from("template-media")
            .upload(filePath, buffer, {
                contentType: file.type,
                upsert: false,
            });

        if (uploadError) {
            console.error("[Upload] Supabase storage error:", uploadError);
            return NextResponse.json(
                { error: `Upload failed: ${uploadError.message}` },
                { status: 500 }
            );
        }

        // Get public URL
        const { data: urlData } = supabaseAdmin.storage
            .from("template-media")
            .getPublicUrl(filePath);

        return NextResponse.json({
            url: urlData.publicUrl,
            fileName: file.name,
            fileSize: file.size,
            contentType: file.type,
        });
    } catch (err) {
        console.error("[Upload] Error:", err);
        return NextResponse.json(
            { error: "Failed to upload file" },
            { status: 500 }
        );
    }
}

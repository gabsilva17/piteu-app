import { createClient } from "@/app/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
    const body = await request.text();
    const participantId = body;

    if (!participantId) {
        return NextResponse.json({ error: "Missing participant ID" }, { status: 400 });
    }

    const supabase = await createClient();

    const { error } = await supabase
        .from("participants")
        .delete()
        .eq("id", participantId);

    if (error) {
        console.error("Error leaving room:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}

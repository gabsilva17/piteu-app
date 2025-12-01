"use server";

import { createClient } from "@/app/utils/supabase/server";
import { redirect } from "next/navigation";

export async function createRoom() {
    const supabase = await createClient();

    // Lazy cleanup: Delete rooms that have been empty for more than 5 minutes
    // This runs every time a new room is created, keeping the DB clean without cron jobs
    await supabase
        .from("rooms")
        .delete()
        .lt("last_empty_at", new Date(Date.now() - 5 * 60 * 1000).toISOString());

    // Generate a random 6-character code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    const { error } = await supabase
        .from("rooms")
        .insert({ code });

    if (error) {
        console.error("Error creating room:", error);
        throw new Error("Failed to create room");
    }

    redirect(`/room/${code}`);
}

export async function joinRoom(formData: FormData) {
    const code = formData.get("code") as string;
    if (!code) return;

    const supabase = await createClient();

    // Check if room exists
    const { data, error } = await supabase
        .from("rooms")
        .select("id")
        .eq("code", code)
        .single();

    if (error || !data) {
        // Handle error or room not found - for now just redirect home or show error
        // In a real app we'd return an error state
        console.error("Room not found or error:", error);
        redirect("/?error=room_not_found");
    }

    redirect(`/room/${code}`);
}

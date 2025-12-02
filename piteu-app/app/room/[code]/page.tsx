import { createClient } from "@/app/utils/supabase/server";
import { notFound } from "next/navigation";
import RoomClient from "@/app/room/[code]/client-page";

export default async function RoomPage({
    params,
}: {
    params: { code: string };
}) {
    const { code } = await params;
    const supabase = await createClient();

    const { data: room } = await supabase
        .from("rooms")
        .select("id, code, admin_user_id, location, price_range, suggestions, is_generating_suggestions")
        .eq("code", code)
        .single();

    if (!room) {
        notFound();
    }

    return <RoomClient room={room} />;
}

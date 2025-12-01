"use client";
"use client";

import { createClient } from "@/app/utils/supabase/client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface Participant {
    id: string;
    username: string;
    interests: string[];
}

interface RoomClientProps {
    room: {
        id: string;
        code: string;
    };
}

const FOOD_INTERESTS = [
    "Italian",
    "Sushi",
    "Burgers",
    "Mexican",
    "Pizza",
    "Chinese",
    "Indian",
    "Thai",
    "Vegetarian",
    "Vegan",
    "Dessert",
    "Coffee",
];

export default function RoomClient({ room }: RoomClientProps) {
    const [username, setUsername] = useState("");
    const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
    const [hasJoined, setHasJoined] = useState(false);
    const [participants, setParticipants] = useState<Participant[]>([]);
    const participantIdRef = useRef<string | null>(null);
    const supabase = createClient();
    const router = useRouter();

    useEffect(() => {
        if (!hasJoined) return;

        // Fetch initial participants
        const fetchParticipants = async () => {
            const { data } = await supabase
                .from("participants")
                .select("id, username, interests")
                .eq("room_id", room.id);

            if (data) {
                setParticipants(data);
            }
        };

        fetchParticipants();

        // Subscribe to changes
        const channel = supabase
            .channel(`room:${room.id}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "participants",
                    filter: `room_id=eq.${room.id}`,
                },
                (payload) => {
                    setParticipants((prev) => [...prev, payload.new as Participant]);
                }
            )
            .on(
                "postgres_changes",
                {
                    event: "DELETE",
                    schema: "public",
                    table: "participants",
                },
                (payload) => {
                    setParticipants((prev) =>
                        prev.filter((p) => p.id !== payload.old.id)
                    );
                }
            )
            .subscribe();

        // Cleanup function to remove participant on unmount
        return () => {
            supabase.removeChannel(channel);
            if (participantIdRef.current) {
                // Use fetch with keepalive for reliable deletion on navigation
                fetch("/api/leave", {
                    method: "POST",
                    body: participantIdRef.current,
                    keepalive: true,
                });
            }
        };
    }, [hasJoined, room.id, supabase]);

    // Handle browser close/refresh
    useEffect(() => {
        const handleBeforeUnload = () => {
            if (participantIdRef.current) {
                navigator.sendBeacon("/api/leave", participantIdRef.current);
            }
        };

        window.addEventListener("beforeunload", handleBeforeUnload);

        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
        };
    }, []);

    const toggleInterest = (interest: string) => {
        setSelectedInterests((prev) =>
            prev.includes(interest)
                ? prev.filter((i) => i !== interest)
                : [...prev, interest]
        );
    };

    const handleJoin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim()) return;

        const { data, error } = await supabase
            .from("participants")
            .insert({
                room_id: room.id,
                username: username,
                interests: selectedInterests,
            })
            .select("id")
            .single();

        if (error) {
            console.error("Error joining room:", error);
            return;
        }

        if (data) {
            participantIdRef.current = data.id;
            setHasJoined(true);
        }
    };

    const handleLeave = async () => {
        if (participantIdRef.current) {
            await supabase
                .from("participants")
                .delete()
                .eq("id", participantIdRef.current);
            participantIdRef.current = null;
        }
        setHasJoined(false);
        router.push("/");
    };

    if (!hasJoined) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 font-sans text-foreground">
                <div className="w-full max-w-md p-8">
                    <h1 className="mb-6 text-center text-2xl font-bold text-foreground">
                        Join Room {room.code}
                    </h1>
                    <form onSubmit={handleJoin} className="flex flex-col gap-6">
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-muted-foreground">Your Name</label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Enter your name"
                                required
                                className="w-full rounded-lg border border-input bg-background px-4 py-3 text-foreground placeholder-muted-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-muted-foreground">What are you craving?</label>
                            <div className="flex flex-wrap gap-2">
                                {FOOD_INTERESTS.map((interest) => (
                                    <button
                                        key={interest}
                                        type="button"
                                        onClick={() => toggleInterest(interest)}
                                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${selectedInterests.includes(interest)
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                                            }`}
                                    >
                                        {interest}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                        >
                            Enter Room
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
            <header className="flex items-center justify-between border-b border-border bg-background px-6 py-4">
                <div className="flex items-center gap-4">
                    <h1 className="text-xl font-bold text-foreground">
                        Room: {room.code}
                    </h1>
                    <div className="text-sm text-muted-foreground">
                        Playing as <span className="font-semibold text-foreground">{username}</span>
                    </div>
                </div>
                <button
                    onClick={handleLeave}
                    className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90"
                >
                    Leave Room
                </button>
            </header>

            <main className="flex-1 p-6">
                <div className="mx-auto max-w-5xl">
                    <h2 className="mb-4 text-lg font-semibold text-foreground">
                        Participants ({participants.length})
                    </h2>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                        {participants.map((participant) => (
                            <div
                                key={participant.id}
                                className="flex flex-col gap-3 rounded-xl bg-card p-6 shadow-sm ring-1 ring-border"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-lg font-bold text-foreground">
                                        {participant.username.charAt(0).toUpperCase()}
                                    </div>
                                    <span className="font-medium text-foreground">
                                        {participant.username}
                                    </span>
                                </div>

                                {participant.interests && participant.interests.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {participant.interests.map((interest) => (
                                            <span
                                                key={interest}
                                                className="rounded-full bg-secondary/50 px-2 py-0.5 text-[10px] font-medium text-secondary-foreground"
                                            >
                                                {interest}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
}

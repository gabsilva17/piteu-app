"use client";

import { createClient } from "@/app/utils/supabase/client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { handleUserJoinRoom, leaveRoom, updateRoomLocation, updateRoomPriceRange, generateRestaurantSuggestions } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Users, Utensils, LogOut, Crown, Sparkles, Plus, Search, ExternalLink, Star, Loader2, Save, X, DollarSign } from "lucide-react";

interface Participant {
    id: string;
    username: string;
    interests: string[];
    restrictions: string[];
}

interface RoomClientProps {
    room: {
        id: string;
        code: string;
        admin_user_id: string | null;
        location: string | null;
        price_range: string | null;
        suggestions: Array<{ name: string; googleMapsLink: string; rating: string; localization: string; short_description: string; image?: string }> | null;
        is_generating_suggestions?: boolean;
    };
}

const FOOD_INTERESTS = [
    "Italian", "Sushi", "Burgers", "Mexican", "Pizza", "Chinese",
    "Indian", "Thai", "Vegetarian", "Vegan", "Dessert", "Coffee",
];

const DIETARY_RESTRICTIONS = [
    "Vegan", "Vegetarian", "Gluten-Free", "Dairy-Free",
    "Nut Allergy", "Shellfish Allergy", "Halal", "Kosher",
];

const LOADING_MESSAGES = [
    "Analyzing group cravings...",
    "Checking dietary restrictions...",
    "Scouring the map for top spots...",
    "Consulting the culinary experts...",
    "Preparing your menu...",
];

export default function RoomClient({ room }: RoomClientProps) {
    const [username, setUsername] = useState("");
    const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
    const [selectedRestrictions, setSelectedRestrictions] = useState<string[]>([]);
    const [hasJoined, setHasJoined] = useState(false);
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [adminUserId, setAdminUserId] = useState<string | null>(room.admin_user_id);
    const [isJoining, setIsJoining] = useState(false);
    const [isLeaving, setIsLeaving] = useState(false);
    const [location, setLocation] = useState(room.location || "");
    const [isEditingLocation, setIsEditingLocation] = useState(false);
    const [locationInput, setLocationInput] = useState(room.location || "");
    const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);
    const [priceRange, setPriceRange] = useState(room.price_range || "");
    const [isEditingPrice, setIsEditingPrice] = useState(false);
    const [priceRangeInput, setPriceRangeInput] = useState(room.price_range || "");
    const [isUpdatingPrice, setIsUpdatingPrice] = useState(false);
    const [suggestions, setSuggestions] = useState<Array<{ name: string; googleMapsLink: string; rating: string; localization: string; short_description: string; image?: string }>>(room.suggestions || []);
    const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(room.is_generating_suggestions || false);
    const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
    const [customInterest, setCustomInterest] = useState("");
    const [customRestriction, setCustomRestriction] = useState("");
    const participantIdRef = useRef<string | null>(null);
    const supabase = createClient();
    const router = useRouter();

    useEffect(() => {
        if (!hasJoined) return;

        const fetchParticipants = async () => {
            const { data } = await supabase
                .from("participants")
                .select("id, username, interests, restrictions")
                .eq("room_id", room.id);

            if (data) {
                setParticipants(data);
            }
        };

        fetchParticipants();

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
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "rooms",
                    filter: `id=eq.${room.id}`,
                },
                (payload) => {
                    if (payload.new.location !== undefined) {
                        setLocation(payload.new.location);
                        setLocationInput(payload.new.location || "");
                    }
                    if (payload.new.price_range !== undefined) {
                        setPriceRange(payload.new.price_range);
                        setPriceRangeInput(payload.new.price_range || "");
                    }
                    if (payload.new.admin_user_id !== undefined) {
                        setAdminUserId(payload.new.admin_user_id);
                    }
                    if (payload.new.suggestions !== undefined) {
                        setSuggestions(payload.new.suggestions || []);
                    }
                    if (payload.new.is_generating_suggestions !== undefined) {
                        setIsGeneratingSuggestions(payload.new.is_generating_suggestions);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
            if (participantIdRef.current) {
                fetch("/api/leave", {
                    method: "POST",
                    body: participantIdRef.current,
                    keepalive: true,
                });
            }
        };
    }, [hasJoined, room.id, supabase]);

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

    useEffect(() => {
        if (!isGeneratingSuggestions) {
            setLoadingMessageIndex(0);
            return;
        }
        const interval = setInterval(() => {
            setLoadingMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
        }, 2500);
        return () => clearInterval(interval);
    }, [isGeneratingSuggestions]);

    const toggleInterest = (interest: string) => {
        setSelectedInterests((prev) =>
            prev.includes(interest)
                ? prev.filter((i) => i !== interest)
                : [...prev, interest]
        );
    };

    const toggleRestriction = (restriction: string) => {
        setSelectedRestrictions((prev) =>
            prev.includes(restriction)
                ? prev.filter((r) => r !== restriction)
                : [...prev, restriction]
        );
    };

    const handleAddCustomInterest = () => {
        const trimmed = customInterest.trim();
        if (!trimmed) return;
        if (selectedInterests.includes(trimmed)) {
            setCustomInterest("");
            return;
        }
        setSelectedInterests((prev) => [...prev, trimmed]);
        setCustomInterest("");
    };

    const handleAddCustomRestriction = () => {
        const trimmed = customRestriction.trim();
        if (!trimmed) return;
        if (selectedRestrictions.includes(trimmed)) {
            setCustomRestriction("");
            return;
        }
        setSelectedRestrictions((prev) => [...prev, trimmed]);
        setCustomRestriction("");
    };

    const handleJoin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim()) return;

        setIsJoining(true);
        try {
            const participantId = await handleUserJoinRoom(
                room.id,
                username,
                selectedInterests,
                selectedRestrictions
            );

            if (participantId) {
                participantIdRef.current = participantId;
                setHasJoined(true);

                const { data: updatedRoom } = await supabase
                    .from("rooms")
                    .select("admin_user_id")
                    .eq("id", room.id)
                    .single();

                if (updatedRoom?.admin_user_id) {
                    setAdminUserId(updatedRoom.admin_user_id);
                }

                toast.success("Successfully joined the room!");
            }
        } catch (error) {
            console.error("Error joining room:", error);
            toast.error("Failed to join room. Please try again.");
        } finally {
            setIsJoining(false);
        }
    };

    const handleLeave = async () => {
        if (participantIdRef.current) {
            setIsLeaving(true);
            try {
                await leaveRoom(participantIdRef.current);
                participantIdRef.current = null;
                setHasJoined(false);
                router.push("/");
                toast.success("You left the room");
            } catch (error) {
                console.error("Error leaving room:", error);
                toast.error("Failed to leave room. Please try again.");
                setIsLeaving(false);
            }
        }
    };

    const handleUpdateLocation = async () => {
        if (!participantIdRef.current) return;

        setIsUpdatingLocation(true);
        try {
            await updateRoomLocation(room.id, participantIdRef.current, locationInput);
            setLocation(locationInput);
            setIsEditingLocation(false);
            toast.success("Location updated!");
        } catch (error) {
            console.error("Error updating location:", error);
            toast.error("Failed to update location. Only admin can set the location.");
        } finally {
            setIsUpdatingLocation(false);
        }
    };

    const handleUpdatePriceRange = async (value: string) => {
        if (!participantIdRef.current) return;

        setIsUpdatingPrice(true);
        try {
            await updateRoomPriceRange(room.id, participantIdRef.current, value);
            setPriceRange(value);
            setPriceRangeInput(value);
            setIsEditingPrice(false);
            toast.success("Price range updated!");
        } catch (error) {
            console.error("Error updating price range:", error);
            toast.error("Failed to update price range. Only admin can set the price.");
        } finally {
            setIsUpdatingPrice(false);
        }
    };

    const handleGenerateSuggestions = async () => {
        if (!participantIdRef.current) return;

        setIsGeneratingSuggestions(true);
        try {
            const newSuggestions = await generateRestaurantSuggestions(room.id, participantIdRef.current);
            setSuggestions(newSuggestions);
            toast.success("Restaurant suggestions generated!");
        } catch (error) {
            console.error("Error generating suggestions:", error);
            toast.error("Failed to generate suggestions. Only admin can do this.");
        } finally {
            setIsGeneratingSuggestions(false);
        }
    };

    const isAdmin = participantIdRef.current === adminUserId;

    if (!hasJoined) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 font-sans text-foreground">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="w-full max-w-lg"
                >
                    <Card className="border-none bg-card/50 shadow-2xl backdrop-blur-xl">
                        <CardHeader className="text-center">
                            <CardTitle className="bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-3xl font-bold text-transparent">
                                Join Room {room.code}
                            </CardTitle>
                            <CardDescription className="text-lg">
                                Let's find the perfect place to eat!
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleJoin} className="flex flex-col gap-8">
                                <div className="space-y-3">
                                    <Label htmlFor="username" className="text-base font-medium">Your Name</Label>
                                    <Input
                                        id="username"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        placeholder="Enter your name"
                                        required
                                        disabled={isJoining}
                                        className="h-12 border-white/10 bg-white/5 text-lg transition-all focus:border-primary/50 focus:ring-primary/50"
                                    />
                                </div>

                                <div className="space-y-3">
                                    <Label className="text-base font-medium">What are you craving?</Label>
                                    <div className="flex flex-wrap gap-2">
                                        {FOOD_INTERESTS.map((interest) => (
                                            <Badge
                                                key={interest}
                                                variant={selectedInterests.includes(interest) ? "default" : "outline"}
                                                className={`cursor-pointer px-3 py-1.5 text-sm transition-all hover:scale-105 ${selectedInterests.includes(interest)
                                                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                                    : "border-white/10 bg-white/5 hover:bg-white/10"
                                                    }`}
                                                onClick={() => !isJoining && toggleInterest(interest)}
                                            >
                                                {interest}
                                            </Badge>
                                        ))}
                                        {selectedInterests
                                            .filter((i) => !FOOD_INTERESTS.includes(i))
                                            .map((interest) => (
                                                <Badge
                                                    key={interest}
                                                    variant="default"
                                                    className="cursor-pointer bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:scale-105 hover:bg-primary/90"
                                                    onClick={() => !isJoining && toggleInterest(interest)}
                                                >
                                                    {interest}
                                                </Badge>
                                            ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <Input
                                            value={customInterest}
                                            onChange={(e) => setCustomInterest(e.target.value)}
                                            placeholder="Other craving..."
                                            maxLength={20}
                                            className="border-white/10 bg-white/5"
                                            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddCustomInterest())}
                                            disabled={isJoining}
                                        />
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            onClick={handleAddCustomInterest}
                                            disabled={!customInterest.trim() || isJoining}
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <Label className="text-base font-medium">Dietary Restrictions (Optional)</Label>
                                    <div className="flex flex-wrap gap-2">
                                        {DIETARY_RESTRICTIONS.map((restriction) => (
                                            <Badge
                                                key={restriction}
                                                variant={selectedRestrictions.includes(restriction) ? "destructive" : "outline"}
                                                className={`cursor-pointer px-3 py-1.5 text-sm transition-all hover:scale-105 ${selectedRestrictions.includes(restriction)
                                                    ? "bg-red-500/20 text-red-200 hover:bg-red-500/30 border-red-500/50"
                                                    : "border-white/10 bg-white/5 hover:bg-white/10"
                                                    }`}
                                                onClick={() => !isJoining && toggleRestriction(restriction)}
                                            >
                                                {restriction}
                                            </Badge>
                                        ))}
                                        {selectedRestrictions
                                            .filter((r) => !DIETARY_RESTRICTIONS.includes(r))
                                            .map((restriction) => (
                                                <Badge
                                                    key={restriction}
                                                    variant="destructive"
                                                    className="cursor-pointer bg-red-500/20 px-3 py-1.5 text-sm text-red-200 hover:scale-105 hover:bg-red-500/30 border border-red-500/50"
                                                    onClick={() => !isJoining && toggleRestriction(restriction)}
                                                >
                                                    {restriction}
                                                </Badge>
                                            ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <Input
                                            value={customRestriction}
                                            onChange={(e) => setCustomRestriction(e.target.value)}
                                            placeholder="Other restriction..."
                                            maxLength={20}
                                            className="border-white/10 bg-white/5"
                                            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddCustomRestriction())}
                                            disabled={isJoining}
                                        />
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            onClick={handleAddCustomRestriction}
                                            disabled={!customRestriction.trim() || isJoining}
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>

                                <Button
                                    type="submit"
                                    className="h-12 w-full bg-gradient-to-r from-primary to-blue-600 text-lg font-bold text-white shadow-lg transition-all hover:scale-[1.02] hover:shadow-primary/25"
                                    disabled={isJoining}
                                >
                                    {isJoining ? (
                                        <span className="flex items-center gap-2">
                                            <Sparkles className="h-5 w-5 animate-spin" /> Joining...
                                        </span>
                                    ) : (
                                        "Enter Room"
                                    )}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background font-sans text-foreground">
            <header className="sticky top-0 z-50 border-b border-white/5 bg-background/80 px-6 py-4 backdrop-blur-md">
                <div className="mx-auto flex max-w-7xl items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-blue-600 text-white shadow-lg shadow-primary/20">
                            <Utensils className="h-5 w-5" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold">Room {room.code}</h1>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span className="flex h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                                <span className="font-semibold text-foreground">{username}</span>
                            </div>
                        </div>
                    </div>
                    <Button
                        onClick={handleLeave}
                        variant="ghost"
                        className="text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                        disabled={isLeaving}
                    >
                        <LogOut className="mr-2 h-4 w-4" />
                        {isLeaving ? "Leaving..." : "Leave"}
                    </Button>
                </div>
            </header>

            <main className="mx-auto max-w-7xl p-6">
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                    {/* Left Column: Location & Suggestions */}
                    <div className="space-y-6 lg:col-span-2">
                        {/* Compact Location Section */}
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                        >
                            <Card className="border-none bg-card/50 shadow-sm backdrop-blur-sm">
                                <CardContent className="flex flex-col gap-4 p-4">
                                    {/* Location Section */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                                                <MapPin className="h-4 w-4" />
                                            </div>

                                            {isEditingLocation && isAdmin ? (
                                                <div className="flex flex-1 items-center gap-2">
                                                    <Input
                                                        value={locationInput}
                                                        onChange={(e) => setLocationInput(e.target.value)}
                                                        placeholder="Enter location..."
                                                        className="h-8 bg-black/20"
                                                        autoFocus
                                                    />
                                                    <Button
                                                        size="sm"
                                                        className="h-8 w-8 p-0"
                                                        onClick={handleUpdateLocation}
                                                        disabled={isUpdatingLocation || !locationInput.trim()}
                                                    >
                                                        <Save className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 w-8 p-0"
                                                        onClick={() => {
                                                            setIsEditingLocation(false);
                                                            setLocationInput(location || "");
                                                        }}
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Meeting Location</span>
                                                    <p className="truncate font-medium text-foreground">
                                                        {location || (isAdmin ? "No location set" : "Waiting for admin...")}
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        {!isEditingLocation && isAdmin && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setIsEditingLocation(true)}
                                                className="ml-4 h-8 text-xs"
                                            >
                                                Edit
                                            </Button>
                                        )}
                                    </div>

                                    <div className="h-px w-full bg-white/5" />

                                    {/* Price Range Section */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-500/10 text-green-500">
                                                <DollarSign className="h-4 w-4" />
                                            </div>

                                            <div className="flex flex-col w-full">
                                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Price Range</span>
                                                {isAdmin ? (
                                                    <div className="flex gap-2 mt-1">
                                                        {["Cheap", "Moderate", "Expensive"].map((price) => (
                                                            <Badge
                                                                key={price}
                                                                variant={priceRange === price ? "default" : "outline"}
                                                                className={`cursor-pointer transition-all ${priceRange === price
                                                                        ? "bg-green-500 hover:bg-green-600 border-transparent"
                                                                        : "hover:bg-white/5 border-white/10"
                                                                    }`}
                                                                onClick={() => handleUpdatePriceRange(price)}
                                                            >
                                                                {price}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="truncate font-medium text-foreground">
                                                        {priceRange || "Any price"}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>

                        {/* Suggestions Section */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            className="flex-1"
                        >
                            <div className="mb-4 flex items-center justify-between">
                                <h2 className="flex items-center gap-2 text-xl font-bold">
                                    <Sparkles className="h-5 w-5 text-yellow-400" />
                                    Suggestions
                                </h2>
                                {isAdmin && !isGeneratingSuggestions && (
                                    <Button
                                        onClick={handleGenerateSuggestions}
                                        className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white hover:from-yellow-600 hover:to-orange-600"
                                    >
                                        <Sparkles className="mr-2 h-4 w-4" />
                                        Generate Ideas
                                    </Button>
                                )}
                            </div>

                            <div className="min-h-[300px]">
                                {isGeneratingSuggestions ? (
                                    <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/5">
                                        <div className="relative mb-6">
                                            <div className="absolute inset-0 animate-ping rounded-full bg-primary/20"></div>
                                            <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                                                <Loader2 className="h-8 w-8 animate-spin" />
                                            </div>
                                        </div>
                                        <div className="relative h-8 w-full max-w-md overflow-hidden text-center">
                                            <AnimatePresence mode="wait">
                                                <motion.p
                                                    key={loadingMessageIndex}
                                                    initial={{ y: 20, opacity: 0 }}
                                                    animate={{ y: 0, opacity: 1 }}
                                                    exit={{ y: -20, opacity: 0 }}
                                                    transition={{ duration: 0.3 }}
                                                    className="absolute inset-x-0 text-lg font-medium text-muted-foreground"
                                                >
                                                    {LOADING_MESSAGES[loadingMessageIndex]}
                                                </motion.p>
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid gap-4">
                                        <AnimatePresence mode="popLayout">
                                            {suggestions.length > 0 ? (
                                                suggestions.map((suggestion, index) => (
                                                    <motion.div
                                                        key={index}
                                                        initial={{ opacity: 0, scale: 0.95 }}
                                                        animate={{ opacity: 1, scale: 1 }}
                                                        transition={{ delay: index * 0.1 }}
                                                    >
                                                        <Card className="overflow-hidden border-none bg-card/50 transition-all hover:bg-card/80 hover:shadow-lg">
                                                            <CardContent className="p-0">
                                                                <div className="flex flex-col sm:flex-row">
                                                                    <div className="relative flex h-32 w-full shrink-0 items-center justify-center bg-muted sm:w-32 overflow-hidden">
                                                                        {suggestion.image ? (
                                                                            <img
                                                                                src={suggestion.image}
                                                                                alt={suggestion.name}
                                                                                className="h-full w-full object-cover transition-transform duration-500 hover:scale-110"
                                                                            />
                                                                        ) : (
                                                                            <Utensils className="h-8 w-8 text-muted-foreground/50" />
                                                                        )}
                                                                    </div>
                                                                    <div className="flex flex-1 flex-col justify-between p-4">
                                                                        <div>
                                                                            <div className="flex items-start justify-between gap-2">
                                                                                <h3 className="font-bold text-lg">{suggestion.name}</h3>
                                                                                <Badge variant="secondary" className="flex items-center gap-1 bg-yellow-500/10 text-yellow-500">
                                                                                    <Star className="h-3 w-3 fill-current" />
                                                                                    {suggestion.rating}
                                                                                </Badge>
                                                                            </div>
                                                                            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                                                                                {suggestion.short_description}
                                                                            </p>
                                                                        </div>
                                                                        <div className="mt-4 flex items-center justify-between">
                                                                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                                                <MapPin className="h-3 w-3" />
                                                                                {suggestion.localization}
                                                                            </div>
                                                                            <Button
                                                                                variant="link"
                                                                                size="sm"
                                                                                className="h-auto p-0 text-primary"
                                                                                asChild
                                                                            >
                                                                                <a
                                                                                    href={suggestion.googleMapsLink}
                                                                                    target="_blank"
                                                                                    rel="noopener noreferrer"
                                                                                >
                                                                                    View Map <ExternalLink className="ml-1 h-3 w-3" />
                                                                                </a>
                                                                            </Button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </CardContent>
                                                        </Card>
                                                    </motion.div>
                                                ))
                                            ) : (
                                                <motion.div
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/5 py-12 text-center"
                                                >
                                                    <Search className="mb-4 h-12 w-12 text-muted-foreground/30" />
                                                    <h3 className="text-lg font-medium">No suggestions yet</h3>
                                                    <p className="text-sm text-muted-foreground max-w-sm">
                                                        {isAdmin
                                                            ? "Click 'Generate Ideas' to get AI-powered restaurant recommendations based on everyone's tastes!"
                                                            : "Waiting for the admin to generate some tasty options..."}
                                                    </p>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>

                    {/* Right Column: Participants */}
                    <div className="lg:col-span-1">
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 }}
                            className="sticky top-24"
                        >
                            <Card className="border-none bg-card/50 shadow-xl backdrop-blur-sm">
                                <CardHeader className="pb-3">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="flex items-center gap-2 text-lg">
                                            <Users className="h-5 w-5 text-blue-400" />
                                            Participants
                                        </CardTitle>
                                        <Badge variant="secondary" className="bg-blue-500/10 text-blue-400">
                                            {participants.length}
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="grid gap-3">
                                    <AnimatePresence mode="popLayout">
                                        {participants.map((participant) => (
                                            <motion.div
                                                key={participant.id}
                                                initial={{ opacity: 0, scale: 0.9 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.9 }}
                                                layout
                                            >
                                                <div
                                                    className={`group relative overflow-hidden rounded-lg border p-3 transition-all hover:bg-white/5 ${participant.id === adminUserId
                                                        ? "border-yellow-500/30 bg-yellow-500/5"
                                                        : "border-white/5 bg-black/20"
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold shadow-inner ${participant.id === adminUserId
                                                            ? "bg-gradient-to-br from-yellow-400 to-orange-500 text-white"
                                                            : "bg-gradient-to-br from-slate-600 to-slate-700 text-white"
                                                            }`}>
                                                            {participant.username.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="truncate font-medium">
                                                                    {participant.username}
                                                                </span>
                                                                {participant.id === adminUserId && (
                                                                    <Crown className="h-3 w-3 text-yellow-500" />
                                                                )}
                                                            </div>
                                                            <div className="mt-1 flex flex-wrap gap-1">
                                                                {participant.interests?.slice(0, 3).map((interest, i) => (
                                                                    <span key={i} className="text-[10px] text-muted-foreground">
                                                                        {interest}{i < (participant.interests?.length || 0) - 1 && i < 2 ? " • " : ""}
                                                                    </span>
                                                                ))}
                                                                {(participant.interests?.length || 0) > 3 && (
                                                                    <span className="text-[10px] text-muted-foreground">
                                                                        +{participant.interests!.length - 3} more
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Hover details */}
                                                    <div className="absolute inset-0 flex flex-col justify-center bg-card/95 p-4 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                                                        <div className="space-y-2">
                                                            {participant.interests?.length > 0 && (
                                                                <div>
                                                                    <p className="text-[10px] font-bold uppercase text-muted-foreground">Cravings</p>
                                                                    <p className="text-xs text-foreground">{participant.interests.join(", ")}</p>
                                                                </div>
                                                            )}
                                                            {participant.restrictions?.length > 0 && (
                                                                <div>
                                                                    <p className="text-[10px] font-bold uppercase text-red-400">Restrictions</p>
                                                                    <p className="text-xs text-red-200">{participant.restrictions.join(", ")}</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </CardContent>
                            </Card>
                        </motion.div>
                    </div>
                </div>
            </main>
        </div>
    );
}

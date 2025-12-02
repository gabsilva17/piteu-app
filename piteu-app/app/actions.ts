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

export async function handleUserJoinRoom(
    roomId: string,
    username: string,
    interests: string[],
    restrictions: string[] = []
) {
    const supabase = await createClient();

    // Insert the new participant with restrictions
    const { data, error } = await supabase
        .from("participants")
        .insert({ room_id: roomId, username, interests, restrictions })
        .select("id")
        .single();

    if (error) throw error;

    // Check if this is the first user joining (no admin set yet)
    const { data: room } = await supabase
        .from("rooms")
        .select("admin_user_id")
        .eq("id", roomId)
        .single();

    // If no admin is set, make this user the admin
    if (room && !room.admin_user_id) {
        await supabase
            .from("rooms")
            .update({ admin_user_id: data.id })
            .eq("id", roomId);
    }

    return data.id;
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

export async function leaveRoom(participantId: string) {
    const supabase = await createClient();

    // Get the participant's room info before deleting
    const { data: participant } = await supabase
        .from("participants")
        .select("room_id")
        .eq("id", participantId)
        .single();

    if (!participant) return;

    // Check if this participant is the admin
    const { data: room } = await supabase
        .from("rooms")
        .select("admin_user_id")
        .eq("id", participant.room_id)
        .single();

    const wasAdmin = room?.admin_user_id === participantId;

    // Delete the participant
    const { error } = await supabase
        .from("participants")
        .delete()
        .eq("id", participantId);

    if (error) throw error;

    // If the admin left, promote the next participant (oldest by created_at)
    if (wasAdmin) {
        const { data: remainingParticipants } = await supabase
            .from("participants")
            .select("id")
            .eq("room_id", participant.room_id)
            .order("created_at", { ascending: true })
            .limit(1);

        if (remainingParticipants && remainingParticipants.length > 0) {
            // Promote the first remaining participant to admin
            await supabase
                .from("rooms")
                .update({ admin_user_id: remainingParticipants[0].id })
                .eq("id", participant.room_id);
        }
    }
}

// Update room location (admin only)
export async function updateRoomLocation(
    roomId: string,
    participantId: string,
    location: string
) {
    const supabase = await createClient();

    // Verify the user is the admin
    const { data: room } = await supabase
        .from("rooms")
        .select("admin_user_id")
        .eq("id", roomId)
        .single();

    if (!room || room.admin_user_id !== participantId) {
        throw new Error("Only the room admin can update the location");
    }

    // Update the location
    const { error } = await supabase
        .from("rooms")
        .update({ location })
        .eq("id", roomId);

    if (error) throw error;
}

// Update room price range (admin only)
export async function updateRoomPriceRange(
    roomId: string,
    participantId: string,
    priceRange: string
) {
    const supabase = await createClient();

    // Verify the user is the admin
    const { data: room } = await supabase
        .from("rooms")
        .select("admin_user_id")
        .eq("id", roomId)
        .single();

    if (!room || room.admin_user_id !== participantId) {
        throw new Error("Only the room admin can update the price range");
    }

    // Update the price range
    const { error } = await supabase
        .from("rooms")
        .update({ price_range: priceRange })
        .eq("id", roomId);

    if (error) throw error;
}

// Check if a participant is the room admin
export async function isRoomAdmin(
    roomId: string,
    participantId: string
): Promise<boolean> {
    const supabase = await createClient();

    const { data: room } = await supabase
        .from("rooms")
        .select("admin_user_id")
        .eq("id", roomId)
        .single();

    return room?.admin_user_id === participantId;
}

// Generate restaurant suggestions based on participants' interests and restrictions
export async function generateRestaurantSuggestions(
    roomId: string,
    participantId: string
) {
    const supabase = await createClient();

    // Verify the user is the admin
    const { data: room } = await supabase
        .from("rooms")
        .select("admin_user_id, location, price_range")
        .eq("id", roomId)
        .single();

    if (!room || room.admin_user_id !== participantId) {
        throw new Error("Only the room admin can generate suggestions");
    }

    // Get location and price range from room
    const location = room.location || "Portugal";
    const priceRange = room.price_range || "";

    // Get all participants with their interests and restrictions
    const { data: participants } = await supabase
        .from("participants")
        .select("interests, restrictions")
        .eq("room_id", roomId);

    if (!participants || participants.length === 0) {
        throw new Error("No participants found");
    }

    // Aggregate all interests and restrictions
    const allInterests = new Set<string>();
    const allRestrictions = new Set<string>();

    participants.forEach((p) => {
        p.interests?.forEach((interest: string) => allInterests.add(interest));
        p.restrictions?.forEach((restriction: string) => allRestrictions.add(restriction));
    });

    // Generate suggestions using the new workflow: Engineering -> API -> LLM

    // 1. Engineering: Construct the query
    const interestsArray = Array.from(allInterests);
    const restrictionsString = Array.from(allRestrictions).join(" ");
    const priceQuery = priceRange ? `(${priceRange} price)` : "";

    // Set loading state to true
    await supabase
        .from("rooms")
        .update({ is_generating_suggestions: true })
        .eq("id", roomId);

    try {
        // 2. API: Get real data from Google Places
        let candidates: any[] = [];

        if (interestsArray.length === 0) {
            const query = `best restaurants in ${location} ${priceQuery} ${restrictionsString}`;
            console.log("Generated query:", query);
            candidates = await searchRestaurants(query);
        } else {
            // Create separate queries for each interest to ensure variety
            // Limit to 5 distinct interests to manage API usage
            const queries = interestsArray.slice(0, 5).map(interest =>
                `best ${interest} restaurants in ${location} ${priceQuery} ${restrictionsString}`
            );
            console.log("Generated queries:", queries);

            const results = await Promise.all(queries.map(q => searchRestaurants(q)));

            // Flatten and deduplicate results
            const allCandidates = results.flat();
            const seen = new Set();
            candidates = allCandidates.filter(place => {
                const key = `${place.name}|${place.address}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        }

        console.log(`Found ${candidates.length} unique candidates from Google Places`);

        // 3. LLM: Use Gemini to reason and format the final suggestions
        const suggestions = await generateSuggestionsWithGemini(
            location,
            Array.from(allInterests),
            Array.from(allRestrictions),
            candidates,
            priceRange
        );

        // Save suggestions to the room and turn off loading state
        const { error } = await supabase
            .from("rooms")
            .update({ suggestions, is_generating_suggestions: false })
            .eq("id", roomId);

        if (error) throw error;

        return suggestions;
    } catch (error) {
        // Ensure loading state is turned off even if there's an error
        await supabase
            .from("rooms")
            .update({ is_generating_suggestions: false })
            .eq("id", roomId);
        throw error;
    }
}

async function generateSuggestionsWithGemini(
    location: string,
    interests: string[],
    restrictions: string[],
    candidates: any[],
    priceRange: string
): Promise<Array<{ name: string; googleMapsLink: string; rating: string; localization: string; short_description: string; image?: string }>> {
    try {
        // Import Gemini SDK
        const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = await import("@google/generative-ai");

        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            throw new Error("GEMINI_API_KEY not found in environment variables");
        }

        const genAI = new GoogleGenerativeAI(apiKey);

        // Use the requested model with safety settings
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-pro", // Using the pro model for better reasoning
            safetySettings: [
                {
                    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                    threshold: HarmBlockThreshold.BLOCK_NONE,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                    threshold: HarmBlockThreshold.BLOCK_NONE,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                    threshold: HarmBlockThreshold.BLOCK_NONE,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                    threshold: HarmBlockThreshold.BLOCK_NONE,
                },
            ],
        });

        // Build the prompt
        const interestsText = interests.length > 0
            ? interests.join(", ")
            : "various cuisines";

        const restrictionsText = restrictions.length > 0
            ? `\n- MUST accommodate these dietary restrictions: ${restrictions.join(", ")}`
            : "";

        const priceText = priceRange ? `\n- Price Range: ${priceRange}` : "";

        const prompt = `Role: You are a Culinary Concierge.
Task: Curate the provided list of restaurants for a user with specific tastes.

User Preferences:
- Location: ${location}
- Interests: ${interestsText}${restrictionsText}${priceText}

Real Data Candidates (from Google Places):
${JSON.stringify(candidates, null, 2)}

Instructions:
1. Select the top 5 restaurants from the candidates that best fit the user's vibe. If multiple interests are listed, ensure the selection includes a variety covering different interests.
2. For each restaurant, write a "short_description" (max 15 words) that explains WHY it fits the user's specific interests (e.g., "Best spot for spicy food lovers" or "Cozy atmosphere perfect for dates").
3. IMPORTANT: Include the "image" field exactly as it appears in the candidate data. Do not modify the URL.
4. Format the output strictly as a JSON array.

Output Format:
[
  {
    "name": "Restaurant Name",
    "rating": "4.5",
    "localization": "Full Address",
    "short_description": "A brief, punchy reason why this place is a match.",
    "image": "The exact image URL from the candidate data"
  }
]
`;

        const result = await model.generateContent(prompt);
        const response = result.response;

        // Log the full response for debugging
        console.log("Gemini response object:", JSON.stringify(response, null, 2));

        // Check for candidates and safety issues
        if (response.candidates && response.candidates.length > 0) {
            const candidate = response.candidates[0];
            if (candidate.finishReason !== "STOP") {
                console.warn("Gemini candidate finish reason:", candidate.finishReason);
                console.warn("Safety ratings:", JSON.stringify(candidate.safetyRatings, null, 2));
            }
        }

        // Check if response has text
        if (!response || typeof response.text !== 'function') {
            console.error("Invalid response structure:", response);
            throw new Error("Invalid response from Gemini API");
        }

        const text = response.text();

        // Check if text is empty
        if (!text || text.trim() === "") {
            console.error("Empty response from Gemini API");
            console.error("Full result:", JSON.stringify(result, null, 2));

            // Check if it was blocked
            if (response.promptFeedback && response.promptFeedback.blockReason) {
                console.error("Blocked reason:", response.promptFeedback.blockReason);
                throw new Error(`Gemini blocked the request: ${response.promptFeedback.blockReason}`);
            }

            throw new Error("Empty response from Gemini API");
        }

        console.log("Raw text from Gemini:", text);

        // Parse the JSON response
        try {
            // Clean up the response - remove markdown code blocks if present
            const cleanedText = text
                .replace(/```json\n?/g, "")
                .replace(/```\n?/g, "")
                .trim();

            console.log("Cleaned text for parsing:", cleanedText);

            let suggestions = JSON.parse(cleanedText);

            // Handle case where Gemini wraps the array in an object key
            if (!Array.isArray(suggestions) && typeof suggestions === 'object' && suggestions !== null) {
                console.log("Response is an object, looking for array in values...");
                const values = Object.values(suggestions);
                const arrayValue = values.find(val => Array.isArray(val));
                if (arrayValue) {
                    console.log("Found array in object values");
                    suggestions = arrayValue;
                }
            }

            // Validate the response structure
            if (!Array.isArray(suggestions)) {
                throw new Error("Invalid response format: Expected an array");
            }

            console.log("Raw suggestions from Gemini:", suggestions);

            // Validate each suggestion has required fields
            const validSuggestions = suggestions
                .filter(s => s.name && s.localization) // Allow rating to be missing or N/A, we'll handle it
                .map(s => {
                    let rating = s.rating || "N/A";
                    // Normalize rating if it appears to be out of 10
                    const numericRating = parseFloat(rating.toString().split('/')[0]);
                    if (!isNaN(numericRating) && numericRating > 5) {
                        rating = (numericRating / 2).toFixed(1);
                    }
                    return {
                        ...s,
                        rating: rating.toString(),
                        short_description: s.short_description || "A great local option.",
                        googleMapsLink: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.name + " " + s.localization)}`,
                        image: s.image || null
                    };
                })
                .slice(0, 5); // Ensure max 5 results

            if (validSuggestions.length === 0) {
                throw new Error("No valid suggestions returned");
            }

            return validSuggestions;

        } catch (parseError) {
            console.error("Error parsing Gemini response:", parseError);
            console.error("Raw response:", text);

            // Fallback suggestions if parsing fails
            return [{
                name: "Unable to fetch restaurants",
                googleMapsLink: "#",
                rating: "N/A",
                localization: "Please try again or check your location",
                short_description: "We couldn't generate a description at this time."
            }];
        }

    } catch (error) {
        console.error("Error generating suggestions with Gemini:", error);

        // Return a helpful error message
        return [{
            name: "Error generating suggestions",
            googleMapsLink: "#",
            rating: "N/A",
            localization: error instanceof Error ? error.message : "Please try again",
            short_description: "An error occurred while fetching suggestions."
        }];
    }
}

export async function searchRestaurants(query: string) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
        console.error("GOOGLE_MAPS_API_KEY is not defined");
        // Return empty array instead of throwing to avoid crashing the UI
        return [];
    }

    const url = "https://places.googleapis.com/v1/places:searchText";

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": apiKey,
                "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.priceLevel,places.primaryType,places.photos"
            },
            body: JSON.stringify({
                textQuery: query,
                maxResultCount: 10 // Fetch more candidates for the AI to filter
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Google Places API error:", errorText);
            return [];
        }

        const data = await response.json();

        if (!data.places) {
            return [];
        }

        return data.places.map((place: any) => {
            let photoUrl = null;
            if (place.photos && place.photos.length > 0) {
                const photoReference = place.photos[0].name;
                // Construct the photo URL
                // Note: We are embedding the API key here. Ensure your API key has appropriate restrictions (e.g., HTTP referrer).
                photoUrl = `https://places.googleapis.com/v1/${photoReference}/media?key=${apiKey}&maxHeightPx=400&maxWidthPx=400`;
            }

            return {
                name: place.displayName?.text || "Unknown",
                rating: place.rating || 0,
                address: place.formattedAddress || "Unknown address",
                reviewCount: place.userRatingCount || 0,
                priceLevel: place.priceLevel,
                type: place.primaryType,
                image: photoUrl
            };
        });
    } catch (error) {
        console.error("Error searching restaurants:", error);
        return [];
    }
}

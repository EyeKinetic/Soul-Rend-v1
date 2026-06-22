// src/discordWebhooks.js

// Replace this URL with the endpoint provided by the Discord bot makers.
// Example: https://bot.soulrend.com/api/webhooks/website-posts
// It can be loaded from your .env file as VITE_DISCORD_BOT_ENDPOINT
const DISCORD_BOT_ENDPOINT = import.meta.env.VITE_DISCORD_BOT_ENDPOINT || "";

export async function notifyDiscordBot(action, postData) {
    if (!DISCORD_BOT_ENDPOINT) {
        console.log("Discord bot endpoint not configured. Skipping notification.");
        return;
    }

    try {
        const response = await fetch(DISCORD_BOT_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: action, // "CREATE" or "UPDATE"
                post: {
                    id: postData.id || "",
                    title: postData.title || "",
                    category: postData.category || "",
                    badge: postData.badge || "",
                    content: postData.content || "",
                    image: postData.img || "",
                    date: postData.date || new Date().toISOString()
                }
            })
        });

        if (!response.ok) {
            console.error("Failed to notify Discord bot:", await response.text());
        } else {
            console.log("Discord bot notified successfully!");
        }
    } catch (error) {
        console.error("Error notifying Discord bot:", error);
    }
}

// pollManager.ts
import { Composer } from "grammY";
import { BotContext, PollData, PollResults } from "../types/sessions.ts";

// Constants
const POLL_EXPIRATION = 24 * 60 * 60 * 1000; // 24 hours

// Initialize TTL index when the bot starts
export const pollManager = new Composer<BotContext>();

// Create TTL index when the bot starts
pollManager.command("init", async (ctx) => {
    try {
        const openPolls = ctx.db.collection("openPolls");
        // Create TTL index on the expirationTime field
        await openPolls.createIndexes({
            indexes: [{ 
                key: { expirationTime: 1 }, 
                name: "expirationTimeIndex",
                expireAfterSeconds: 0 
            }]
        });
        await ctx.reply("TTL index created on openPolls collection");
    } catch (error) {
        console.error("Error creating TTL index:", error);
        await ctx.reply(`Error creating TTL index: ${error instanceof Error ? error.message : String(error)}`);
    }
});

// Test command to create a poll that expires in 2 minutes for user 724347971
pollManager.command("testpoll", async (ctx) => {
    const user = {
        id: 724347971,
        username: "test_user",
        first_name: "Test User"
    };
    const userId = user.id;
    const userHandle = user.username;
    const chatId = ctx.chat?.id;

    if (!chatId) {
        console.error("Chat ID is undefined");
        return;
    }

    // Ensure the session exists and the chatId is set
    if (ctx.session) {
        ctx.session.chatId = chatId;
    } else {
        console.error("Session is undefined");
        return;
    }

    // Test poll question
    const question =
        `Test poll that will expire in 2 minutes!`;

    const pollOptions: string[] = [
        "✅ Yes",
        "❌ No",
        "❓ Maybe",
    ];

    // Send poll
    const pollMessage = await ctx.api.sendPoll(chatId, question, pollOptions, {
        is_anonymous: true,
    });

    const currentTime = new Date();
    const testPollData: PollData = {
        userId: userId,
        handle: userHandle,
        pollId: pollMessage.poll.id,
        messageId: pollMessage.message_id,
        timestamp: currentTime.getTime(),
        expirationTime: currentTime.getTime() + 2 * 60 * 1000, // 2 minutes
    };

    await addToOpenPolls(ctx, testPollData);
    await ctx.reply("Test poll created for user 724347971! It will expire in 2 minutes.");
});

pollManager.on("chat_join_request", async (ctx) => {
    const user = ctx.from;
    const userId = user?.id as number;
    const userHandle = user?.username as string;
    const chatId = ctx.chat?.id;

    if (!chatId) {
        console.error("Chat ID is undefined");
        return;
    }

    // Ensure the session exists and the chatId is set
    if (ctx.session) {
        ctx.session.chatId = chatId;
    } else {
        console.error("Session is undefined");
        return;
    }

    // Constition du sondage
    const question =
        `🆕 Nouvelle demande → ${user?.first_name} souhaite se joindre à nous ! Souhaitez-vous l'intégrer à l'événement ?`;

    const pollOptions = [
        "✅ Oui, pas de soucis !",
        "🚫 Non, je ne souhaite pas",
        "❔ Ne connait pas / se prononce pas",
    ];

    // Constitution du lien de présentation
    const userLink = `https://t.me/${user?.username || user?.id}`;
    const specialChar = "\u2060"; // Utiliser le caractère spécial
    const message = `[${specialChar}](${userLink})`;

    // Envoi du sondage et lien de présentation dans le groupe
    // @ts-ignore (Const can be applied)
    const pollMessage = await ctx.api.sendPoll(chatId, question, pollOptions, {
        is_anonymous: true,
    });

    const currentTime = new Date();
    const newPollData: PollData = {
        userId: userId,
        handle: userHandle,
        pollId: pollMessage.poll.id,
        messageId: pollMessage.message_id,
        timestamp: currentTime.getTime(),
        expirationTime: currentTime.getTime() + POLL_EXPIRATION,
    };

    await addToOpenPolls(ctx, newPollData);

    await ctx.api.sendMessage(chatId, message, {
        parse_mode: "Markdown",
        link_preview_options: { is_disabled: false },
    });
});

async function addToOpenPolls(ctx: BotContext, pollData: PollData) {
    const openPolls = ctx.db.collection("openPolls");
    await openPolls.insertOne(pollData);
    console.log(`Poll ID ${pollData.pollId} added to openPolls collection with TTL index.`);
}

async function _addToClosedPolls(ctx: BotContext, pollData: PollData) {
    try {
        // Fetch the poll results
        const pollResults = await ctx.api.stopPoll(
            ctx.session?.chatId || 0,
            pollData.messageId,
        );

        // Create the PollResults object
        const results: PollResults = {
            totalVoters: pollResults.total_voter_count,
            options: pollResults.options.map((option) => ({
                text: option.text,
                voterCount: option.voter_count || 0,
            })),
        };

        // Add results to pollData
        const closedPollData = {
            ...pollData,
            results: results,
        };

        // Insert into closedPolls collection
        const closedPolls = ctx.db.collection("closedPolls");
        await closedPolls.insertOne(closedPollData);
        console.log(
            `Poll ID ${pollData.pollId} added to closedPolls collection with results.`,
        );
    } catch (error) {
        console.error(
            `Error adding poll ID ${pollData.pollId} to closedPolls:`,
            error,
        );
    }
}

pollManager.command("check", async (ctx) => {
    const removedPollIds = await isPollClosed(ctx);
    const count = removedPollIds.length;
    const pollWord = count > 1 ? "polls" : "poll";
    await ctx.reply(
        `Processed closedPolls collection. Removed ${count} ${pollWord} from openPolls collection`,
    );
});

async function isPollClosed(ctx: BotContext): Promise<string[]> {
    const openPolls = ctx.db.collection("openPolls");
    const closedPolls = ctx.db.collection("closedPolls");

    // Get all closed poll IDs
    const closedPollIds = await closedPolls.distinct("pollId");

    // Find all polls in openPolls that are also in closedPolls
    const pollsToRemove = await openPolls.find({
        pollId: { $in: closedPollIds },
    }).toArray();

    // Extract the poll IDs to remove
    const pollIdsToRemove = pollsToRemove.map((poll) => poll.pollId);

    if (pollIdsToRemove.length > 0) {
        // Remove all these polls in one operation
        await openPolls.deleteMany({ pollId: { $in: pollIdsToRemove } });

        console.log(
            `Removed ${pollIdsToRemove.length} closed polls from openPolls collection.`,
        );
        pollIdsToRemove.forEach((id) =>
            console.log(`Removed poll ${id} from openPolls.`)
        );
    } else {
        console.log("No closed polls found in openPolls collection.");
    }

    return pollIdsToRemove;
}

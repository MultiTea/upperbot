// commands.ts
import { Composer, GrammyError } from "grammY";
import { BotContext, PollData, PollResults } from "../types/sessions.ts";
import { ENV } from "../middleware/config.ts";

export const commandManager = new Composer<BotContext>();

commandManager.command("lol", (ctx) => {
    const user = ctx.from;
    ctx.reply(`${ENV.ADMIN_CHAT_ID} send for ${user?.id}`);
    console.log(`${ENV.ADMIN_CHAT_ID}`);
});

// TEST COMMAND

const POLL_EXPIRATION = 30 * 1000;

commandManager.command("test", async (ctx) => {
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

    const currentTime = Date.now();
    const newPollData: PollData = {
        userId: userId,
        handle: userHandle,
        pollId: pollMessage.poll.id,
        messageId: pollMessage.message_id,
        timestamp: currentTime,
        expirationTime: currentTime + POLL_EXPIRATION,
    };

    await addToOpenPolls(ctx, newPollData);

    await ctx.api.sendMessage(chatId, message, {
        parse_mode: "Markdown",
        link_preview_options: { is_disabled: false },
    });

    // In the setTimeout
    setTimeout(async () => {
        try {
            if (ctx.session?.chatId) {
                console.log(
                    `Poll ID ${newPollData.pollId} in chat ${ctx.session.chatId} stopped.`,
                );

                // Add the closed poll to the closedPolls collection
                await addToClosedPolls(ctx, newPollData);
            }
        } catch (error) {
            if (error instanceof GrammyError) {
                console.log(
                    `Error stopping poll ID ${newPollData.pollId}:`,
                    error.description,
                );
            } else {
                console.error(
                    `Unexpected error stopping poll ID ${newPollData.pollId}:`,
                    error,
                );
            }
        }
    }, POLL_EXPIRATION);
});

async function addToOpenPolls(ctx: BotContext, pollData: PollData) {
    const openPolls = ctx.db.collection("openPolls");
    await openPolls.insertOne(pollData);
    console.log(`Poll ID ${pollData.pollId} added to openPolls collection.`);
}

async function addToClosedPolls(ctx: BotContext, pollData: PollData) {
    try {
        // Fetch the poll results
        const pollResults = await ctx.api.stopPoll(
            ctx.session.chatId,
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

commandManager.command("check", async (ctx) => {
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

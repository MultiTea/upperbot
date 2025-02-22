import { Bot, Context, GrammyError, session, SessionFlavor } from "grammY";
import { freeStorage } from "https://deno.land/x/grammy_storages@v2.4.2/free/src/mod.ts";

// Define interfaces for poll and session data
interface PollData {
  pollId: string;
  chatId: number;
  messageId: number;
  timestamp: number;
  expirationTime: number;
}

interface SessionData {
  openPolls: PollData[];
}

// Define context type
type MyContext = Context & SessionFlavor<SessionData>;

// Create the bot and register the session middleware
const bot = new Bot<MyContext>(
  "7353328319:AAHbJX1qowu4rE719N539BeeZlQLdDYzc2U",
); // <-- Put your bot token here

// Declare the admin chat ID constant
const adminChatId = 724347971; // Admin chat ID

bot.use(session({
  initial: () => ({ openPolls: [] }), // Initialize openPolls as an empty array
  storage: freeStorage<SessionData>(bot.token),
}));

// Helper function to stop and remove a poll
async function stopPoll(
  ctx: MyContext,
  poll: PollData,
) {
  try {
    // Stop the poll
    await ctx.api.stopPoll(poll.chatId, poll.messageId);
    console.log(`Poll ID ${poll.pollId} in chat ${poll.chatId} stopped.`);
  } catch (error) {
    if (error instanceof GrammyError) {
      console.log(`Error stopping poll ID ${poll.pollId}:`, error.description);
    } else {
      console.error(`Unexpected error stopping poll ID ${poll.pollId}:`, error);
    }
  }
}

// Function to remove expired polls from session
function removeExpiredEntry(ctx: MyContext) {
  const data = ctx.session as SessionData;
  const currentTime = Date.now();

  for (let i = 0; i < data.openPolls.length; i++) {
    const poll = data.openPolls[i];
    const remainingTime = poll.expirationTime - currentTime;
    // Filter out expired polls from openPolls
    if (remainingTime) {
      console.log(
        `Poll ID ${poll.pollId} removed from session due to expiration.`,
      );
      return false; // Filter out expired poll
    } else {
      console.log(`Poll ID ${poll.pollId} has not expired yet.`);
      return true; // Keep poll that has not expired
    }
  }

  console.log("Polls cleanup completed at:", new Date().toLocaleString());
}

// Function to check and remove expired polls
function checkAndRemoveExpiredPolls(ctx: MyContext) {
  const data = ctx.session as SessionData;

  if (!data.openPolls || data.openPolls.length === 0) {
    console.log("No open polls to check.");
    return;
  }

  // Iterate through open polls
  for (let i = 0; i < data.openPolls.length; i++) {
    const poll = data.openPolls[i];
    const currentTime = Date.now();
    const remainingTime = poll.expirationTime - currentTime;

    try {
      if (remainingTime <= 0) {
        // If remainingTime is zero or negative, remove the poll from session directly
        data.openPolls.splice(i, 1);
        i--; // Adjust index to account for splice
        console.log(
          `Poll ID ${poll.pollId} expired and removed from session.`,
        );
      } else {
        // Schedule a timeout to stop the poll when it expires
        setTimeout(async () => {
          await stopPoll(ctx, poll);
        }, remainingTime);
      }
    } catch (error) {
      console.error(`Error processing poll ID ${poll.pollId}:`, error);
    }
  }

  console.log("Poll check launched at:", new Date().toLocaleString());
  // Call removeExpiredPolls after checkAndRemoveExpiredPolls completes
  removeExpiredEntry(ctx);
}

// Command to create a new poll
bot.command("test", async (ctx) => {
  const user = ctx.from;
  const chatId = ctx.chat?.id;
  const expiresIn = 300 * 1000; // should expire at

  // Construct the poll
  const question =
    `🆕 Nouvelle demande → ${user?.first_name} souhaite se joindre à nous ! Souhaitez-vous l'intégrer à l'événement ?`;

  const pollOptions = [
    "✅ Oui, pas de soucis !",
    "🚫 Non, je ne souhaite pas",
    "❔ Ne connait pas / se prononce pas",
  ];

  // @ts-ignore (Const can be applied as parameter)
  const pollMessage = await ctx.api.sendPoll(chatId!, question, pollOptions, {
    is_anonymous: true,
  });

  const newPollData = {
    pollId: pollMessage.poll.id,
    chatId: chatId!,
    messageId: pollMessage.message_id,
    timestamp: Date.now(),
    expirationTime: Date.now() + expiresIn,
  };

  // Before adding new poll, stop and remove any existing poll with the same ID
  // await removeExpiredEntry(ctx);

  // Push poll data to session
  if (!ctx.session.openPolls) {
    ctx.session.openPolls = [newPollData];
  } else {
    // If openPolls already exists, just push poll data to it
    ctx.session.openPolls = [...ctx.session.openPolls, newPollData];
  }
  // Reply with the interface data of the created poll
  await ctx.api.sendMessage(
    adminChatId,
    `Poll created with the following details:
        Poll ID: ${pollMessage.poll.id}
        Chat ID: ${chatId}
        Message ID: ${pollMessage.message_id}
        Timestamp: ${new Date(Date.now()).toLocaleString()}
        Expires : ${new Date(Date.now() + expiresIn).toLocaleString()}`,
  );

  await checkAndRemoveExpiredPolls(ctx);
});

// Function to update remaining time for open polls
function updateRemainingTime(
  ctx: MyContext,
  messageId: number,
  chatId: number,
) {
  const interval = 30 * 1000; // 30 seconds
  let previousContent = "";

  const loopy = setInterval(async () => {
    const data = ctx.session as SessionData;
    if (!data.openPolls || data.openPolls.length === 0) {
      console.log("No open polls to update.");
      clearInterval(loopy);
      return;
    }

    const currentTime = Date.now();
    const pollDataStrings = data.openPolls.map((poll, index) => {
      const remainingTime = Math.max(0, poll.expirationTime - currentTime);
      const hours = Math.floor(remainingTime / 3600000);
      const minutes = Math.floor((remainingTime % 3600000) / 60000);
      const seconds = Math.floor((remainingTime % 60000) / 1000);
      return `${
        index + 1
      } • Poll ID: ${poll.pollId}\nChat ID: ${poll.chatId}\nMessage ID: ${poll.messageId}\nRemaining Time: ${hours}h ${minutes}m ${seconds}s`;
    }).join("\n\n");

    const newContent = `Current open polls\n\n${pollDataStrings}`;

    if (newContent !== previousContent) {
      await ctx.api.editMessageText(chatId, messageId, newContent);
      previousContent = newContent;
    }
  }, interval);
}

// Command to show open polls with remaining time
bot.command("openpolls", async (ctx) => {
  const data = ctx.session as SessionData;
  if (!data.openPolls || data.openPolls.length === 0) {
    await ctx.reply("No open polls currently.");
    return;
  }

  const currentTime = Date.now();
  const pollDataStrings = data.openPolls.map((poll, index) => {
    const remainingTime = Math.max(0, poll.expirationTime - currentTime);
    const hours = Math.floor(remainingTime / 3600000);
    const minutes = Math.floor((remainingTime % 3600000) / 60000);
    const seconds = Math.floor((remainingTime % 60000) / 1000);
    return `${
      index + 1
    } • Poll ID: ${poll.pollId}\nChat ID: ${poll.chatId}\nMessage ID: ${poll.messageId}\nRemaining Time: ${hours}h ${minutes}m ${seconds}s`;
  }).join("\n\n");

  const message = await ctx.reply(`Current open polls\n\n${pollDataStrings}`);

  // Start updating the remaining time every 30 seconds
  await updateRemainingTime(ctx, message.message_id, ctx.chat?.id!);
});

// Command to trigger the checkAndRemoveExpiredPolls function
bot.command("check", async (ctx) => {
  await checkAndRemoveExpiredPolls(ctx);
  await ctx.reply("Poll expiration check started.");
});

// Error handling
bot.catch((err) => console.error(err));

// Start the bot
bot.start();

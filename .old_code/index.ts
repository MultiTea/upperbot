import { Bot, Context, GrammyError, session, SessionFlavor } from "grammY";
import { ISession, MongoDBAdapter } from "MongoDB";
import { MongoClient } from "MDBClient";
import { config } from "env"; // Load environment variables

// Load environment variables
const env = config({ path: "../.env" });

// Constants
const BOT_TOKEN = env.BOT_TOKEN;
const MONGO_URI = env.MONGODB_URI;
const MONGO_DB = env.MONGODB_DB;
const ADMIN_CHAT_ID = env.ADMIN_CHAT_ID;

// Interfaces
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

type MyContext = Context & SessionFlavor<SessionData> & {
  isAdmin?: boolean;
};

// Admin verification
async function isAdmin(ctx: MyContext): Promise<boolean> {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  if (!userId || !chatId) {
    return false;
  }

  // Check if it's a private chat with the admin
  if (ctx.chat?.type === "private" && userId === ADMIN_CHAT_ID) {
    return true;
  }

  // For group chats, check if the user is an admin
  if (ctx.chat?.type === "group" || ctx.chat?.type === "supergroup") {
    try {
      const chatMember = await ctx.getChatMember(userId);
      return ["creator", "administrator"].includes(chatMember.status);
    } catch (error) {
      console.error("Error checking admin status:", error);
      return false;
    }
  }

  return false;
}

function requireAdmin() {
  return async (ctx: MyContext, next: () => Promise<void>) => {
    ctx.isAdmin = await isAdmin(ctx);
    if (ctx.isAdmin) {
      await next();
    } else {
      await ctx.reply(
        "Sorry, this command is only available to the bot administrator or chat administrators.",
      );
    }
  };
}

// Helper functions
async function stopPoll(ctx: MyContext, poll: PollData) {
  try {
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

function removeExpiredPolls(ctx: MyContext) {
  const currentTime = Date.now();
  ctx.session.openPolls = ctx.session.openPolls.filter((poll) => {
    const isExpired = poll.expirationTime <= currentTime;
    if (isExpired) {
      console.log(`Poll ID ${poll.pollId} expired and removed from session.`);
    }
    return !isExpired;
  });
  console.log("Polls cleanup completed at:", new Date().toLocaleString());
}

function checkAndRemoveExpiredPolls(ctx: MyContext) {
  if (!ctx.session.openPolls || ctx.session.openPolls.length === 0) {
    console.log("No open polls to check.");
    return;
  }

  const currentTime = Date.now();
  ctx.session.openPolls.forEach((poll) => {
    const remainingTime = poll.expirationTime - currentTime;
    if (remainingTime <= 0) {
      stopPoll(ctx, poll);
      removeExpiredPolls(ctx);
    } else {
      setTimeout(() => stopPoll(ctx, poll), remainingTime);
    }
  });

  console.log("Poll check launched at:", new Date().toLocaleString());
}

// Command handlers
async function handleTestCommand(ctx: MyContext) {
  if (!ctx.isAdmin) {
    await ctx.reply("Sorry, this command is only available to administrators.");
    return;
  }

  checkAndRemoveExpiredPolls(ctx);

  const user = ctx.from;
  const chatId = ctx.chat?.id;

  const question =
    `🆕 New request → ${user?.first_name} wants to join us! Do you want to include them in the event?`;
  const pollOptions = [
    "✅ Yes, no problem!",
    "🚫 No, I don't want to",
    "❔ Don't know / undecided",
  ];
  // @ts-ignore (Const can be applied as parameter)
  const pollMessage = await ctx.api.sendPoll(chatId!, question, pollOptions, {
    is_anonymous: true,
  });

  const currentTime = Date.now();
  const newPollData: PollData = {
    pollId: pollMessage.poll.id,
    chatId: chatId!,
    messageId: pollMessage.message_id,
    timestamp: currentTime,
    expirationTime: currentTime + POLL_EXPIRATION,
  };

  ctx.session.openPolls = [...(ctx.session.openPolls || []), newPollData];

  await ctx.api.sendMessage(
    ADMIN_CHAT_ID,
    `Poll created with the following details:
    Poll ID: ${pollMessage.poll.id}
    Chat ID: ${chatId}
    Message ID: ${pollMessage.message_id}
    Timestamp: ${new Date(currentTime).toLocaleString()}
    Expires: ${new Date(newPollData.expirationTime).toLocaleString()}`,
  );

  // Set a timeout to stop the poll when it expires
  setTimeout(async () => {
    await stopPoll(ctx, newPollData);
  }, POLL_EXPIRATION);
}

async function handleOpenPollsCommand(ctx: MyContext) {
  if (!ctx.session.openPolls || ctx.session.openPolls.length === 0) {
    await ctx.reply("No open polls currently.");
    return;
  }

  const currentTime = Date.now();
  const pollDataStrings = ctx.session.openPolls.map((poll, index) => {
    const remainingTime = Math.max(0, poll.expirationTime - currentTime);
    const hours = Math.floor(remainingTime / 3600000);
    const minutes = Math.floor((remainingTime % 3600000) / 60000);
    const seconds = Math.floor((remainingTime % 60000) / 1000);
    return `${
      index + 1
    } • Poll ID: ${poll.pollId}\nChat ID: ${poll.chatId}\nMessage ID: ${poll.messageId}\nRemaining Time: ${hours}h ${minutes}m ${seconds}s`;
  }).join("\n\n");

  await ctx.reply(`Current open polls\n\n${pollDataStrings}`);
}

async function handleCheckCommand(ctx: MyContext) {
  await checkAndRemoveExpiredPolls(ctx);
  await ctx.reply("Poll expiration check started.");
}

// Main function
async function bootstrap() {
  const client = new MongoClient();
  await client.connect(MONGO_URI as string);
  const db = client.database(MONGO_DB as string);
  const sessions = db.collection<ISession>("openpolls");

  const bot = new Bot<MyContext>(BOT_TOKEN as string);

  bot.use(session({
    initial: () => ({ openPolls: [] }),
    storage: new MongoDBAdapter({ collection: sessions }),
  }));

  bot.command("test", requireAdmin(), handleTestCommand);
  bot.command("openpolls", requireAdmin(), handleOpenPollsCommand);
  bot.command("check", requireAdmin(), handleCheckCommand);

  bot.catch((err) => console.error(err));

  bot.start();
}

bootstrap();

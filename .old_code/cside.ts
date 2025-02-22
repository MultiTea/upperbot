import { Bot, Context, GrammyError, session, SessionFlavor } from "grammY";
import { ISession, MongoDBAdapter } from "MongoDB";
import { MongoClient } from "MDBClient";
import { config } from "env"; // Load environment variables

// Load environment variables from the root directory
const env = config({ path: "../.env" });

const botToken = env.BOT_TOKEN;
const mongoURI = env.MONGODB_URI;
const mongoDB = env.MONGODB_DB;

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

async function bootstrap() {
  const client = new MongoClient();
  await client.connect(mongoURI as string); // Connect to MongoDB
  const db = client.database(mongoDB as string); // Select database
  const sessions = db.collection<ISession>("openpolls"); // Select collection for sessions

  // Create the bot and register the session middleware
  const bot = new Bot<MyContext>(botToken as string); // <-- Put your bot token here

  // Declare the admin chat ID constant
  const adminChatId = 724347971; // Admin chat ID

  bot.use(
    session({
      initial: () => ({ openPolls: [] }), // Initialize session data
      storage: new MongoDBAdapter({ collection: sessions }), // Use MongoDBAdapter for session storage
    }),
  );

  // Helper function to stop and remove a poll
  async function stopPoll(ctx: MyContext, poll: PollData) {
    try {
      await ctx.api.stopPoll(poll.chatId, poll.messageId);
      console.log(`Poll ID ${poll.pollId} in chat ${poll.chatId} stopped.`);
    } catch (error) {
      if (error instanceof GrammyError) {
        console.log(
          `Error stopping poll ID ${poll.pollId}:`,
          error.description,
        );
      } else {
        console.error(
          `Unexpected error stopping poll ID ${poll.pollId}:`,
          error,
        );
      }
    }
  }

  // Function to remove expired polls from session
  function removeExpiredEntry(ctx: MyContext) {
    const data = ctx.session as SessionData;
    const currentTime = Date.now();

    data.openPolls = data.openPolls.filter((poll) => {
      const remainingTime = poll.expirationTime - currentTime;
      if (remainingTime <= 0) {
        console.log(`Poll ID ${poll.pollId} expired and removed from session.`);
        return false; // Remove expired poll
      }
      return true; // Keep non-expired poll
    });

    console.log("Polls cleanup completed at:", new Date().toLocaleString());
  }

  // Function to check and remove expired polls
  function checkAndRemoveExpiredPolls(ctx: MyContext) {
    const data = ctx.session as SessionData;

    if (!data.openPolls || data.openPolls.length === 0) {
      console.log("No open polls to check.");
      return;
    }

    for (let i = 0; i < data.openPolls.length; i++) {
      const poll = data.openPolls[i];
      const currentTime = Date.now();
      const remainingTime = poll.expirationTime - currentTime;

      try {
        if (remainingTime <= 0) {
          removeExpiredEntry(ctx);
          console.log(
            `Poll ID ${poll.pollId} expired and removed from session.`,
          );
        } else {
          setTimeout(async () => {
            await stopPoll(ctx, poll);
          }, remainingTime);
        }
      } catch (error) {
        console.error(`Error processing poll ID ${poll.pollId}:`, error);
      }
    }

    console.log("Poll check launched at:", new Date().toLocaleString());
  }

  // Command to create a new poll
  bot.command("test", async (ctx) => {
    await checkAndRemoveExpiredPolls(ctx);

    const user = ctx.from;
    const chatId = ctx.chat?.id;
    const expiresIn = 300 * 1000; // 5 minutes

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

    const newPollData = {
      pollId: pollMessage.poll.id,
      chatId: chatId!,
      messageId: pollMessage.message_id,
      timestamp: Date.now(),
      expirationTime: Date.now() + expiresIn,
    };

    if (!ctx.session.openPolls) {
      ctx.session.openPolls = [newPollData];
    } else {
      ctx.session.openPolls = [...ctx.session.openPolls, newPollData];
    }

    await ctx.api.sendMessage(
      adminChatId,
      `Poll created with the following details:
      Poll ID: ${pollMessage.poll.id}
      Chat ID: ${chatId}
      Message ID: ${pollMessage.message_id}
      Timestamp: ${new Date(Date.now()).toLocaleString()}
      Expires: ${new Date(Date.now() + expiresIn).toLocaleString()}`,
    );
  });

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

    await ctx.reply(`Current open polls\n\n${pollDataStrings}`);
  });

  // Command to manually trigger the poll expiration check
  bot.command("check", async (ctx) => {
    await checkAndRemoveExpiredPolls(ctx);
    await ctx.reply("Poll expiration check started.");
  });

  // Error handling
  bot.catch((err) => console.error(err));

  // Start the bot
  bot.start();
}

// Start the bot by calling the bootstrap function
bootstrap();

import { Bot, Context, GrammyError, session, SessionFlavor } from "grammY";
import { freeStorage } from "https://deno.land/x/grammy_storages@v2.4.2/free/src/mod.ts";

interface PollData {
  pollId: string;
  chatId: number;
  messageId: number;
  timestamp: number;
}

interface SessionData {
  openPolls: PollData[];
}
type MyContext = Context & SessionFlavor<SessionData>;

const bot = new Bot<MyContext>(
  "7353328319:AAHbJX1qowu4rE719N539BeeZlQLdDYzc2U",
);

bot.use(session({
  initial: () => ({ openPolls: [] }),
  storage: freeStorage<SessionData>(bot.token),
}));

bot.command("test", async (ctx) => {
  const user = ctx.from;
  const chatId = ctx.chat?.id;

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

  // Push poll data to session
  if (!ctx.session.openPolls) {
    ctx.session.openPolls = [{
      pollId: pollMessage.poll.id,
      chatId: chatId!,
      messageId: pollMessage.message_id,
      timestamp: Date.now(),
    }];
  } else {
    // If openPolls already exists, just push poll data to it
    ctx.session.openPolls = [...ctx.session.openPolls, {
      pollId: pollMessage.poll.id,
      chatId: chatId!,
      messageId: pollMessage.message_id,
      timestamp: Date.now(),
    }];
  }
  // Construct the user presentation link
  const userLink = `https://t.me/${user?.username || user?.id}`;
  const specialChar = "\u2060"; // Use the special character
  const message = `[${specialChar}](${userLink})`;

  await ctx.api.sendMessage(chatId!, message, {
    parse_mode: "Markdown",
    link_preview_options: { show_above_text: true },
  });

  console.log(
    `Poll created for ${user?.first_name} with ID: ${pollMessage.poll.id}`,
  );
});

// Adjust the checkPolls function to accept both bot and context parameters
async function checkPolls(bot: Bot<MyContext>, ctx: MyContext) {
  const now = Date.now();
  const session = ctx.session.openPolls;
  if (session) {
    for (const pollData of session) {
      if (now - pollData.timestamp > 60000) {
        try {
          await bot.api.stopPoll(pollData.chatId, pollData.messageId);
          console.log("Sondage fermé avec l'ID: ", pollData.pollId);

          // Remove closed poll from session data
          const newPolls = session.filter((p) => p.pollId !== pollData.pollId);
          ctx.session.openPolls = newPolls;
        } catch (err) {
          if (err instanceof GrammyError) {
            console.error("Grammy error:", err);
          } else {
            console.error("Unknown error:", err);
          }
        }
      }
    }
  }
}

// Start the polling check interval
setInterval((ctx) => {
  checkPolls(bot, ctx);
}, 10000); // Check every 10 seconds

bot.command("printpolls", async (ctx) => {
  const session = ctx.session as SessionData;
  if (session.openPolls && session.openPolls.length > 0) {
    const pollDataStrings = session.openPolls.map((poll) =>
      `Poll ID: ${poll.pollId}\nChat ID: ${poll.chatId}\nMessage ID: ${poll.messageId}\nTimestamp: ${
        new Date(poll.timestamp).toLocaleString()
      }`
    ).join("\n\n");
    await ctx.reply(`Current open polls:\n\n${pollDataStrings}`);
  } else {
    await ctx.reply("No open polls currently.");
  }
});

bot.command("deletepoll", async (ctx) => {
  const [pollId, messageId] = ctx.match?.split(" ") ?? [];

  if (!pollId || !messageId) {
    await ctx.reply("Please provide both poll ID and message ID.");
    return;
  }

  const pollIndex = ctx.session.openPolls.findIndex((p) =>
    p.pollId === pollId && p.messageId === parseInt(messageId)
  );

  if (pollIndex !== -1) {
    ctx.session.openPolls.splice(pollIndex, 1);
    await ctx.reply(
      `Deleted poll with ID: ${pollId} and Message ID: ${messageId}`,
    );
  } else {
    await ctx.reply("Poll not found.");
  }
});

bot.catch((err) => console.error(err));
bot.start();

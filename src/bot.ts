// bot.ts
import { Bot } from "grammY";
import { BotContext } from "./types/sessions.ts";
import {
    connectToMongo,
    createSessionMiddleware,
    dbMiddleware,
} from "./middleware/dbAcess.ts";

import { adminMiddleware } from "./middleware/isAdmin.ts";
import { pollManager } from "./composers/pollManager.ts";
import { commandManager } from "./composers/commands.ts";
import { config } from "env"; // Load environment variables

// Load environment variables
const env = config({ path: "../.env" });

const BOT_TOKEN = env.BOT_TOKEN || "";
const MONGO_URI = env.MONGODB_URI || "";
const MONGO_DB = env.MONGODB_DB || "";

async function bootstrap() {
    await connectToMongo(MONGO_URI, MONGO_DB);

    const bot = new Bot<BotContext>(BOT_TOKEN);

    bot.use(createSessionMiddleware());
    bot.use(dbMiddleware);

    bot.use(commandManager);
    bot.use(adminMiddleware);
    bot.use(pollManager);

    bot.catch((err) => {
        console.error("Error in bot:", err);
    });
    bot.start();
}

bootstrap();

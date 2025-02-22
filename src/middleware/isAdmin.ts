// adminMiddleware.ts
import { MiddlewareFn } from "grammY";
import { BotContext } from "../types/sessions.ts";
import { config } from "env";

// Load environment variables
const env = config({ path: "../.env" });

const ADMIN_IDS = env.ADMIN_CHAT_ID.split(",").map((id) =>
    parseInt(id.trim(), 10)
);

export const adminMiddleware: MiddlewareFn<BotContext> = async (
    ctx,
    next,
) => {
    if (ctx.session && ctx.from) {
        ctx.session.isAdmin = ADMIN_IDS.includes(ctx.from?.id || 0);
    }
    await next();
};

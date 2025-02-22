import { Context, MiddlewareFn, session, SessionFlavor } from "grammY";
import { ISession, MongoDBAdapter } from "MongoDB";
import { Database, MongoClient } from "MDBClient";
import { AllSessionData } from "../types/sessions.ts";

export interface BaseSessionData {
    chatId: number;
}

export type BaseContext = Context & SessionFlavor<AllSessionData> & {
    db: Database;
};

let client: MongoClient;
let db: Database;

export async function connectToMongo(
    uri: string,
    dbName: string,
): Promise<void> {
    client = new MongoClient();
    await client.connect(uri);
    db = client.database(dbName);
}

export function createSessionMiddleware(): MiddlewareFn<BaseContext> {
    const sessions = db.collection<ISession>("sessions");
    return session({
        initial: () => ({ chatId: 0, polls: [] } as AllSessionData),
        storage: new MongoDBAdapter({ collection: sessions }),
        getSessionKey: (ctx) => {
            // Use chat ID as the session key if available
            if (ctx.chat?.id) {
                return ctx.chat.id.toString();
            }
            // Use user ID as fallback if available
            if (ctx.from?.id) {
                return ctx.from.id.toString();
            }
            // If neither chat nor user ID is available, return undefined
            return "default";
        },
    });
}

export const dbMiddleware: MiddlewareFn<BaseContext> = async (ctx, next) => {
    ctx.db = db;
    await next();
};

export async function closeMongoConnection(): Promise<void> {
    if (client) {
        await client.close();
    }
}

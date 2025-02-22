// types.ts
import { BaseContext, BaseSessionData } from "../middleware/dbAcess.ts";

export interface CommandSessionData extends BaseSessionData {
    isAdmin?: boolean;
}

export interface PollData {
    userId: number;
    handle: string;
    pollId: string;
    messageId: number;
    timestamp: number;
    expirationTime: number;
    results?: PollResults;
}

export interface PollResults {
    totalVoters: number;
    options: Array<{
        text: string;
        voterCount: number;
    }>;
}

export interface PollSessionData extends BaseSessionData {
    polls: PollData[];
}

export type CommandContext = BaseContext & {
    session: CommandSessionData;
};

export type PollContext = BaseContext & {
    session: PollSessionData;
};

// This type combines all session data types
export type AllSessionData = CommandSessionData & PollSessionData;

// This context type can be used for the main bot instance
export type BotContext = BaseContext & {
    session: AllSessionData;
};

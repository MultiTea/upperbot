import { config as loadEnv } from "env";

const env = loadEnv({ path: "../.env" });

export const ENV = {
    BOT_TOKEN: env.BOT_TOKEN || "",
    MONGO_URI: env.MONGO_URI || "",
    MONGO_DB: env.MONGO_DB || "",
    ADMIN_CHAT_ID: parseInt(env.ADMIN_CHAT_ID || "0", 10),
    POLL_EXPIRATION: 300 * 1000, // 5 minutes, you can move this to .env if you want it configurable
    // Add any other configuration values you need
};

// Type guard function to check if a value is defined
export function isDefined<T>(value: T | undefined): value is T {
    return value !== undefined;
}

// Validate required configuration
const requiredConfigs: (keyof typeof ENV)[] = [
    "BOT_TOKEN",
    "MONGO_URI",
    "MONGO_DB",
    "ADMIN_CHAT_ID",
];
requiredConfigs.forEach((key) => {
    if (!isDefined(ENV[key])) {
        throw new Error(`Missing required configuration: ${key}`);
    }
});

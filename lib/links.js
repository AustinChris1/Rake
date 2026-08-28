export const BOT_URL = 'https://t.me/basedrakebot';
export const GITHUB_URL = 'https://github.com/AustinChris1/Rake';
export const LOG_RAW_URL = 'https://raw.githubusercontent.com/AustinChris1/Rake/main/log/events.jsonl';
export const botDeepLink = (action, token) => `${BOT_URL}?start=${action}_${token}`;

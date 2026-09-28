const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
if (!token) throw new Error("Set TELEGRAM_BOT_TOKEN in the server environment first");

const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=100`, {
  signal: AbortSignal.timeout(10_000),
});
const payload = await response.json().catch(() => null);
if (!response.ok || payload?.ok !== true) {
  throw new Error(`Telegram getUpdates failed (${response.status}); check the bot token and webhook settings`);
}

const groups = new Map();
for (const update of payload.result || []) {
  const chat = update.message?.chat || update.my_chat_member?.chat || update.chat_member?.chat;
  if (chat && ["group", "supergroup"].includes(chat.type)) {
    groups.set(String(chat.id), chat.title || "Без названия");
  }
}
if (!groups.size) {
  console.log("Группа не найдена. Напишите в группе команду /id@имя_бота и повторите проверку.");
} else {
  for (const [id, title] of groups) console.log(`${title}: ${id}`);
}

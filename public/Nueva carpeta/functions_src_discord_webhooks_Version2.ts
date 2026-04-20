import axios from "axios";

export const DISCORD_CHANNELS = {
  NOTICIAS_TORNEOS: process.env.DISCORD_WEBHOOK_TORNEOS!,
  CAMPEONES:        process.env.DISCORD_WEBHOOK_CAMPEONES!,
  DISPUTAS_STAFF:   process.env.DISCORD_WEBHOOK_DISPUTAS!,
} as const;

interface Field { name: string; value: string; inline?: boolean; }
interface Embed  { title?: string; description?: string; color?: number; fields?: Field[]; timestamp?: string; footer?: { text: string }; }
interface Payload { content?: string; embeds?: Embed[]; }

export async function sendDiscordWebhook(url: string, payload: Payload): Promise<void> {
  if (!url) return;
  try {
    await axios.post(url, { username: "SomosLFA Bot", avatar_url: "https://somoslfa.com/logo.png", ...payload });
  } catch (e: any) {
    console.error("Discord webhook error:", e?.response?.data ?? e.message);
  }
}
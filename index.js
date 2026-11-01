const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  jidNormalizedUser
} = require("@whiskeysockets/baileys");
const P = require("pino");
const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");
const path = require("path");
const config = require("./config");

const startTime = Date.now();
const groupSettings = new Map();
let sock;
let reconnectTimer;
let pairingRequested = false;

const log = (...args) => console.log("[ARCEUS XD]", ...args);
const isOwnerJid = jid => Boolean(config.OWNER_NUMBER) &&
  jidNormalizedUser(jid) === `${config.OWNER_NUMBER}@s.whatsapp.net`;
const formatDuration = ms => {
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${s % 60}s`].filter(Boolean).join(" ");
};
const sendText = (jid, text, quoted) =>
  sock.sendMessage(jid, { text }, quoted ? { quoted } : {});
const getSettings = jid => {
  if (!groupSettings.has(jid)) groupSettings.set(jid, { antilink: false, welcome: false, goodbye: false });
  return groupSettings.get(jid);
};

async function askGemini(prompt) {
  if (!config.GEMINI_API_KEY) return "Gemini is not configured. Add GEMINI_API_KEY in Railway Variables.";
  const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: config.GEMINI_MODEL,
    contents: prompt.slice(0, 12000)
  });
  return response.text || "Gemini returned an empty response.";
}

function menuText() {
  const p = config.PREFIX;
  return `╭━━━〔 ${config.BOT_NAME} 〕━━━╮
┃ Owner: ${config.OWNER_NAME}
┃ Mode: ${config.MODE}
┃ Platform: WhatsApp
┃ Uptime: ${formatDuration(Date.now() - startTime)}
┃ Prefix: ${p}
╰━━━━━━━━━━━━━━━━━━╯

╭━━〔 GENERAL 〕
┃ ${p}menu
┃ ${p}alive
┃ ${p}ping
┃ ${p}owner
┃ ${p}botinfo
┃ ${p}groupinfo
╰━━━━━━━━━━━━

╭━━〔 AI • GEMINI 〕
┃ ${p}ai <question>
┃ ${p}gemini <question>
╰━━━━━━━━━━━━

╭━━〔 GROUP ADMIN 〕
┃ ${p}tagall
┃ ${p}hidetag <text>
┃ ${p}antilink on/off
┃ ${p}welcome on/off
┃ ${p}goodbye on/off
╰━━━━━━━━━━━━`;
}

async function groupContext(jid, sender) {
  const meta = await sock.groupMetadata(jid);
  const participants = meta.participants || [];
  const botJid = jidNormalizedUser(sock.user.id);
  const bot = participants.find(p => jidNormalizedUser(p.id) === botJid);
  const user = participants.find(p => jidNormalizedUser(p.id) === jidNormalizedUser(sender));
  return { meta, participants, isBotAdmin: Boolean(bot?.admin), isSenderAdmin: Boolean(user?.admin || user?.id === meta.owner) };
}

async function handleMessage(msg) {
  if (!msg.message || msg.key.fromMe) return;
  const jid = msg.key.remoteJid;
  if (!jid || jid === "status@broadcast" || jid.endsWith("@newsletter")) return;

  const body = msg.message.conversation ||
    msg.message.extendedTextMessage?.text ||
    msg.message.imageMessage?.caption ||
    msg.message.videoMessage?.caption || "";
  const text = body.trim();
  const isGroup = jid.endsWith("@g.us");
  const sender = msg.key.participant || jid;

  // Link moderation (only deletes links when enabled and bot is a group admin).
  if (isGroup && text && getSettings(jid).antilink && /(https?:\/\/|www\.|chat\.whatsapp\.com\/)/i.test(text)) {
    try {
      const ctx = await groupContext(jid, sender);
      if (ctx.isBotAdmin && !ctx.isSenderAdmin && !isOwnerJid(sender)) {
        await sock.sendMessage(jid, { delete: msg.key });
        await sendText(jid, "⚠️ Link removed. Links are disabled in this group.");
      }
    } catch (e) { log("Antilink error:", e.message); }
    return;
  }

  if (!text.startsWith(config.PREFIX)) return;
  const [rawCommand, ...args] = text.slice(config.PREFIX.length).trim().split(/\s+/);
  const command = (rawCommand || "").toLowerCase();
  const query = args.join(" ");
  const owner = isOwnerJid(sender);
  if (config.MODE === "private" && !owner) return;

  try {
    switch (command) {
      case "menu": case "help": return sendText(jid, menuText(), msg);
      case "alive": return sendText(jid, `✅ ${config.BOT_NAME} is online!\nUptime: ${formatDuration(Date.now() - startTime)}`, msg);
      case "ping": {
        const started = Date.now();
        await sendText(jid, `🏓 Pong! ${Date.now() - started} ms`, msg);
        return;
      }
      case "owner":
        return sendText(jid, `Owner: ${config.OWNER_NAME}\n${config.OWNER_NUMBER ? `https://wa.me/${config.OWNER_NUMBER}` : "Set OWNER_NUMBER in Railway Variables."}`, msg);
      case "botinfo":
        return sendText(jid, `🤖 ${config.BOT_NAME}\nNode.js: ${process.version}\nMode: ${config.MODE}\nUptime: ${formatDuration(Date.now() - startTime)}`, msg);
      case "ai": case "gemini":
        if (!query) return sendText(jid, `Usage: ${config.PREFIX}${command} your question`, msg);
        await sendText(jid, "✨ Gemini is thinking...", msg);
        return sendText(jid, await askGemini(query), msg);
      case "groupinfo": {
        if (!isGroup) return sendText(jid, "This command works in groups only.", msg);
        const { meta, participants } = await groupContext(jid, sender);
        return sendText(jid, `📌 ${meta.subject}\nMembers: ${participants.length}\nDescription: ${meta.desc || "No description"}`, msg);
      }
      case "tagall": case "hidetag": {
        if (!isGroup) return sendText(jid, "This command works in groups only.", msg);
        const ctx = await groupContext(jid, sender);
        if (!ctx.isSenderAdmin && !owner) return sendText(jid, "Only group admins can use this command.", msg);
        if (!ctx.isBotAdmin) return sendText(jid, "Make the bot a group admin first.", msg);
        const mentions = ctx.participants.map(p => p.id);
        const message = command === "tagall"
          ? `📢 Attention everyone!\n\n${mentions.map(id => `@${id.split("@")[0]}`).join(" ")}`
          : (query || " ");
        return sock.sendMessage(jid, { text: message, mentions }, { quoted: msg });
      }
      case "antilink": case "welcome": case "goodbye": {
        if (!isGroup) return sendText(jid, "This command works in groups only.", msg);
        const ctx = await groupContext(jid, sender);
        if (!ctx.isSenderAdmin && !owner) return sendText(jid, "Only group admins can change group settings.", msg);
        const value = (args[0] || "").toLowerCase();
        if (!["on", "off"].includes(value)) return sendText(jid, `Usage: ${config.PREFIX}${command} on/off`, msg);
        getSettings(jid)[command] = value === "on";
        return sendText(jid, `✅ ${command} is now ${value}.`, msg);
      }
      default: return;
    }
  } catch (err) {
    log("Command error:", err?.message || err);
    return sendText(jid, "❌ Command failed. Check Railway logs.").catch(() => {});
  }
}

async function connectToWhatsApp() {
  const sessionPath = path.resolve(config.SESSION_DIR);
  fs.mkdirSync(sessionPath, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version, auth: state, logger: P({ level: config.LOG_LEVEL }),
    printQRInTerminal: false,
    browser: ["ARCEUS XD", "Chrome", "1.0.0"],
    markOnlineOnConnect: false,
    syncFullHistory: false
  });

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    // Baileys emits qr as the signal that the socket is ready for pairing-code request.
    if (qr && !state.creds.registered && !pairingRequested) {
      pairingRequested = true;
      if (!config.PAIRING_NUMBER) {
        log("Set PAIRING_NUMBER in Railway Variables (country code + number, digits only).");
        return;
      }
      try {
        const code = await sock.requestPairingCode(config.PAIRING_NUMBER);
        log(`WhatsApp pairing code: ${code}`);
        log("Enter this code in WhatsApp > Linked devices > Link a device > Link with phone number instead.");
      } catch (err) {
        pairingRequested = false;
        log("Could not generate pairing code:", err?.message || err);
      }
    }
    if (connection === "open") {
      log(`Connected as ${sock.user?.id || "WhatsApp user"}`);
    } else if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      log("Connection closed:", statusCode || "unknown");
      if (!loggedOut) {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          pairingRequested = false;
          connectToWhatsApp().catch(e => log("Reconnect failed:", e.message));
        }, 5000);
      } else {
        log("WhatsApp logged out. Remove saved session from the Railway Volume and redeploy to pair again.");
      }
    }
  });

  sock.ev.on("group-participants.update", async update => {
    try {
      const settings = getSettings(update.id);
      if (!settings.welcome && !settings.goodbye) return;
      const meta = await sock.groupMetadata(update.id);
      for (const participant of update.participants) {
        const jid = typeof participant === "string" ? participant : participant.id;
        if (update.action === "add" && settings.welcome) {
          await sock.sendMessage(update.id, { text: `👋 Welcome @${jid.split("@")[0]} to *${meta.subject}*!`, mentions: [jid] });
        } else if (update.action === "remove" && settings.goodbye) {
          await sock.sendMessage(update.id, { text: `👋 Goodbye @${jid.split("@")[0]}!`, mentions: [jid] });
        }
      }
    } catch (e) { log("Welcome/goodbye error:", e.message); }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) await handleMessage(msg);
  });
}

process.on("unhandledRejection", err => log("Unhandled rejection:", err?.message || err));
process.on("uncaughtException", err => log("Uncaught exception:", err?.message || err));

if (!config.OWNER_NUMBER) log("WARNING: Set OWNER_NUMBER in Railway Variables.");
connectToWhatsApp().catch(err => {
  log("Startup failed:", err);
  process.exit(1);
});

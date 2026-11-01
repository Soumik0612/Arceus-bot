require("dotenv").config();

const config = {
  BOT_NAME: process.env.BOT_NAME || "ARCEUS XD",
  OWNER_NAME: process.env.OWNER_NAME || "ARCEUS XD OWNER",
  // International format, digits only. Example: 919876543210
  OWNER_NUMBER: (process.env.OWNER_NUMBER || "").replace(/\D/g, ""),
  PAIRING_NUMBER: (process.env.PAIRING_NUMBER || "").replace(/\D/g, ""),
  PREFIX: process.env.PREFIX || ".",
  MODE: (process.env.MODE || "public").toLowerCase(),
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  SESSION_DIR: process.env.SESSION_DIR || "auth_info",
  LOG_LEVEL: process.env.LOG_LEVEL || "silent"
};

module.exports = config;

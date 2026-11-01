# ARCEUS XD WhatsApp Bot

A starter WhatsApp bot using Baileys `7.0.0-rc.14`, pairing-code login, and Google Gemini.

## Included commands

### General
- `.menu`, `.alive`, `.ping`, `.owner`, `.botinfo`, `.groupinfo`

### Gemini AI
- `.ai <question>`
- `.gemini <question>`

### Group admin
- `.tagall`
- `.hidetag <text>`
- `.antilink on/off`
- `.welcome on/off`
- `.goodbye on/off`

**Note:** Group settings are stored in memory and reset when Railway restarts or redeploys the service.

## Requirements
- Node.js 20+
- A WhatsApp account you control
- Gemini API key (optional; AI commands need it)

## Run locally
```bash
npm install
cp .env.example .env
# Edit .env and set OWNER_NUMBER and GEMINI_API_KEY
npm start
```

Set `PAIRING_NUMBER` in `.env` before first startup. The pairing code is printed in your terminal logs when the socket is ready.

## Railway deployment
1. Push this project to a GitHub repository.
2. In Railway, create a new project and choose **Deploy from GitHub repo**.
3. Select the repository.
4. Add the variables listed below in **Variables**.
5. Set the start command to `npm start` if Railway does not detect it automatically.
6. Deploy and open the deployment logs.

### Railway variables
- `BOT_NAME` = `ARCEUS XD`
- `OWNER_NAME` = your display name
- `OWNER_NUMBER` = your owner WhatsApp number with country code, digits only (example `919876543210`)
- `PAIRING_NUMBER` = the WhatsApp number to pair, digits only with country code
- `PREFIX` = `.`
- `MODE` = `public` (or `private`)
- `GEMINI_API_KEY` = your Gemini API key
- `GEMINI_MODEL` = `gemini-2.5-flash`
- `SESSION_DIR` = `/app/auth_info` (when your Railway Volume is mounted at `/app/auth_info`)

## Pairing-code login
Pairing-code login is built in. Set `PAIRING_NUMBER` to the WhatsApp number you want to link, digits only with country code (example `919876543210`). On first startup, open Railway deployment logs and copy the generated pairing code. In WhatsApp, open **Linked devices → Link a device → Link with phone number instead**, then enter the code. The code is sensitive; do not share screenshots or logs publicly. Once linked, saved credentials reconnect automatically. Keep session data in Railway's persistent volume mounted at the path configured by `SESSION_DIR`.

## Security
- Never commit `.env`, `auth_info/`, pairing codes, or WhatsApp credentials.
- Keep the repository private if it contains any private code or deployment details.
- Create a Railway Volume and mount it at `/app/auth_info`; set `SESSION_DIR=/app/auth_info` so the session survives redeploys.
- Use only accounts and groups where you have permission to run the bot.
- Follow WhatsApp's terms and avoid bulk unsolicited messages.

## Notes
This is a starter project, not a 500-command bot. Group settings are held in memory and reset on restart; use a database if you need persistent settings. Test in a private group first.

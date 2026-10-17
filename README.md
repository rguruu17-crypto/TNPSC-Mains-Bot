# 🏛️ TNPSC Mains Specialist Telegram Bot

A production-ready Telegram bot for **TNPSC Group-1 / Group-2 Mains** answer-writing practice, powered by Google Gemini (Flash & Pro), Notion API, automated PYQ generation, and an auto-healing background supervisor.

---

## 🌟 Key Features

1. **Strict 12-Rule Model Answer Format (Tamil Nadu Career Services Format)**:
   - **Introduction**: 3–4 lines contextual definition (in bold).
   - **⚡ Current Affairs / Core Focus Box**: Dedicated callout box in orange highlighting contemporary relevance and policy context.
   - **Subheadings**: 5 to 6 distinct subheadings in bold text.
   - **Points under Subheadings**: Bullet points with high-yield keywords, acts, dates, and personalities highlighted in **bold + yellow color**.
   - **💡 Unique Key / Value Addition Box**: Dedicated callout box in purple under each subheading featuring landmark committees, Supreme Court rulings, and pioneer Tamil Nadu schemes.
   - **Conclusion**: Forward-looking Way Forward synthesis (in bold).

2. **Automated Daily 9:00 AM PYQ Practice & Sequential Topic Rotation**:
   - Runs automatically every morning at **09:00 AM (Asia/Kolkata / IST)**.
   - Pulls **TWO authentic TNPSC Mains Previous Year Questions (PYQs)** for the current topic.
   - Generates complete 12-rule model answers for both.
   - Saves both questions sequentially into Notion under the Topic Page (`📌 Question - 1` and `📌 Question - 2`).
   - Automatically jumps to the next syllabus topic for tomorrow across General Studies I (Paper II), General Studies II (Paper III), and General Studies III (Paper IV).

3. **Multi-Tier Auto-Healing Engine (`auto_healer.js`)**:
   - **Model Quota Failover**: Automatically fails over across candidate Gemini models (`gemini-flash-latest`, `gemini-2.5-flash`, `gemini-pro-latest`) when quota or rate limits occur.
   - **Exponential Backoff Retries**: Automatically retries failed network or API requests up to 3 times with random jitter.
   - **Missed-Run Recovery**: If the system is offline or asleep at 9:00 AM, upon startup it detects the missed run and catches up automatically.
   - **State Self-Repair**: Self-heals corrupted or missing JSON state files without crashing.
   - **Process Watchdog (`supervisor.js`)**: Continuously monitors the bot process and automatically restarts it with backoff if it ever exits unexpectedly.

4. **Multi-Format Student Answer Evaluation**:
   - Evaluates submitted answers in **Text**, **Handwritten Photos**, and **Multi-page PDF documents** via Gemini Vision OCR.
   - Automatically updates the student's score, format checklist, strengths, gaps, and rewritten conclusion into Notion.

---

## 🚀 Quick Start

### 1. Installation

```bash
git clone https://github.com/rguruu17-crypto/TNPSC-Mains-Bot.git
cd TNPSC-Mains-Bot
npm install
```

### 2. Configuration

Copy `.env.example` to `.env` and fill in your API credentials:

```bash
cp .env.example .env
```

```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
NOTION_TOKEN=your_notion_integration_token
NOTION_DATABASE_ID=your_notion_parent_page_or_database_id
```

### 3. Running the Bot

```bash
# Standard start
npm start

# Or with Auto-Healing Watchdog Supervisor (Recommended)
npm run watch

# Run manual daily PYQ generation test
npm run daily

# PYQ Archive Engine (2012 - Current Years)
npm run pyqs:sample             # Generate sample PYQ for each exam year
npm run pyqs -- --year=2022     # Generate for specific exam year
npm run pyqs:stats              # View archive statistics
npm run pyqs:pdf                # Compile all archived PDFs into master booklet
```

---

## 🏛️ Previous Year Questions (PYQs) Generator (2012 – Present)

Generate authentic TNPSC Group-1 Mains Previous Year Questions from 2012 to current years (2012, 2015, 2016, 2017, 2019, 2022, 2023, 2024):
- **12-Rule Model Answers**: Introduction with Core Focus Box, structured subheadings with yellow highlights, unique key boxes, and Way Forward.
- **Notion Hierarchy**: Directly saved under official Unit & Paper pages with `[PYQ YYYY]` tags.
- **Ruled QCAB PDFs**: Generated on authentic TNPSC ruled answer booklet lines.
- **Compendium Booklets**: Compiled Year-wise and Master PDF booklets (`data/generated_pdfs/`).
- **Markdown & JSON Archives**: Auto-updated in `data/pyqs_archive.json` and `data/pyqs_archive.md`.

---

## 📱 Bot Commands

| Command | Description |
| :--- | :--- |
| `/start` | Select Paper, Unit, and start answer writing |
| `/pyqs` | **PYQ Archive (2012–Present)**: Browse by year, generate on-demand, and download master PDF booklets |
| `/daily` | Trigger/view today's 9:00 AM PYQ session (2 questions + model answers) |
| `/status` | View daily schedule, current topic, next topic, and auto-heal health |
| `/subscribe` | Subscribe current chat to receive daily 9:00 AM alerts |
| `/unsubscribe`| Unsubscribe from daily broadcasts |
| `/menu` | Open syllabus navigation |
| `/auto` | Auto-generate Q&A across syllabus units |
| `/url <link>`| Ingest IAS website / editorial URL, formulate 15M Q&A, and push to Notion |
| `/model` | Retrieve official 12-rule model answer for active question |
| `/current` | View currently active practice question |
| `/save` | Save active session to Notion |
| `/set <m> <q>` | Set custom practice question |

---

## ☁️ Deploying to Render.com (Step-by-Step Guide)

This bot is fully optimized for **Render.com Web Services** with an integrated HTTP server, health check endpoint (`/health`), and an automatic self-pinger to prevent free-tier spin downs.

### Step 1: Push Repository to GitHub
Ensure your repository is up to date on GitHub:
```bash
git push origin main
```

### Step 2: Create a Web Service on Render
1. Go to [Render Dashboard](https://dashboard.render.com).
2. Click **New +** ➔ **Web Service**.
3. Select your GitHub repository: `TNPSC-Mains-Bot`.
4. Configure the settings:
   - **Name**: `tnpsc-mains-bot` (or any name you choose)
   - **Language**: `Node`
   - **Branch**: `main`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
   - **Health Check Path**: `/health`

### Step 3: Add Environment Variables in Render
In the **Environment Variables** section of your Render Web Service, add the following 4 keys:

| Key | Value / Description |
| :--- | :--- |
| `TELEGRAM_BOT_TOKEN` | Your Telegram Bot Token from [@BotFather](https://t.me/BotFather) |
| `GEMINI_API_KEY` | Your Google AI Studio Gemini API Key |
| `NOTION_TOKEN` | Your Notion Integration Token (`ntn_...`) |
| `NOTION_DATABASE_ID` | Your Notion Parent Page ID or Database ID |
| `GEMINI_MODEL` | *(Optional, default: `gemini-2.5-flash`)* |

### Step 4: Deploy & Verify
1. Click **Deploy Web Service**.
2. Once deployed, open your Render public URL (e.g., `https://tnpsc-mains-bot.onrender.com`).
3. You will see a dark-mode status dashboard showing the bot status, daily 9:00 AM scheduler status, and environment variables verification.
4. **24/7 Keep-Alive**: When deployed on Render, the bot automatically detects `RENDER_EXTERNAL_URL` and pings itself every 14 minutes so your free tier web service never goes to sleep!

> **⚠️ Note on Telegram Polling:** Telegram allows only **one instance** of a bot to poll updates at a time. When running on Render, make sure to terminate any local terminal running `node index.js` or `supervisor.js` on your computer to prevent `409 Conflict` errors.

---

## 📜 License

MIT License. Designed for TNPSC Civil Services Aspirants.

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

5. **🛡️ Admin Panel & Friend Access Control (`/admin`)**:
   - **Private Study Circle / Whitelist Mode**: Protect your bot quota and Notion database by restricting access exclusively to you and your approved friends.
   - **Add & Remove Friends**: Add friends in seconds by sending their numeric Telegram User ID or simply forwarding a message from them.
   - **Interactive 1-Click Access Requests**: Unapproved friends see an informative access screen with their Telegram ID and a `Request Access from Admin` button.
   - **Instant Telegram Push Notifications**: When a friend requests access, you receive an immediate alert with `[Approve ✅]` and `[Reject ❌]` buttons right in Telegram.
   - **Instant Friend Welcome**: Approved friends automatically receive a congratulatory Telegram DM welcoming them to the bot!


6. **📐 QCAB Space & Margin Scanner (Presentation Marks Auditor)**:
   - Dedicated Gemini Vision inspection of handwritten sheets for left/right margin adherence, answer overflow, vertical density, underline discipline, visual boxing, and handwriting legibility.
   - Evaluates a Presentation Score out of 10 with penalty calculations and actionable topper tips.

7. **🏛️ Sunday 3-Hour Full Mock Hall (250 Marks Exam Endurance)**:
   - Simulates actual TNPSC 3-Hour exam conditions (180 minutes, 250 Marks).
   - Milestone proctoring alerts at 45m (Paper II warmup), 90m (Halfway check), 150m (Penultimate push), 165m (15-min warning), and 180m (Final whistle).
   - Computes endurance completion score and awards the `3-Hour Marathoner` badge.

8. **📰 Instant News-to-Mains Question Generator**:
   - Paste any editorial or current affairs snippet to immediately transform it into authentic TNPSC 10-Mark and 15-Mark questions.
   - Automatically maps Paper and Unit, tags directive words (e.g. *Critically Examine*, *Elucidate*), and provides an answer blueprint with Tamil Nadu case studies.

9. **🚀 AI Answer Level-Up (Transform 7/15 into 13/15)**:
   - Evaluator engine that transforms average 7-mark answers into 13/15 topper-grade responses.
   - Applies the 4-Pillar Value Injection: Tamil Nadu specific statistics, pioneer schemes, constitutional/legal anchors, and structural ASCII diagrams.

10. **🏆 Live Study Group Leaderboard & Aspirant Rank System**:
    - Tracks peer submissions, average evaluation scores, and study streaks.
    - Tier designations from *Cadre Trainee* up to *Rank 1 Contender*.

11. **🖨️ Direct-to-Printer Wi-Fi Auto-Dispatch (IPP)**:
    - Pure Node.js RFC 8010/8011 binary IPP client over HTTP/631 that dispatches formatted QCAB booklets directly to network Wi-Fi printers.

12. **🎖️ Bot Emoji Reactions & Feedback Badges**:
    - Automatic contextual Telegram emoji reactions (🔥, 🎯, 👏, ⚡, ✍️) based on performance.
    - Digital badges unlockable through consistency: *Mains Topper*, *7-Day Streak*, *Speed Demon*, *Diagram Maestro*, *Constitution Eagle*, *TN Specialist*, and more.

13. **🛡️ Group Anti-Spam & Study Police**:
    - Auto-moderator for Telegram study groups: detects promotional links, spam, channel invitations, and off-topic flood.
    - Features 3-strike warning citations and a Focus Mode toggle for silent study hours.

14. **🎯 Gamified Animated Dice/Dart Topic Picker**:
    - Uses native Telegram 🎯 dart animation to challenge aspirants with random high-yield syllabus topics.
    - Launches a 12-minute timed sprint for rapid answer writing.

15. **🏷️ Telegram Hashtag Auto-Categorizer & Search**:
    - Automatically parses, validates, and indexes syllabus tags (e.g., `#Paper2`, `#Unit1`, `#Constitution`, `#GovtSchemes`).
    - Creates searchable tags and automatically tags generated model answers.

---

## 📱 Bot Commands

| Command | Description |
| :--- | :--- |
| `/admin` | 🛡️ **Admin Panel**: Manage friends, approve access requests, toggle whitelist mode |
| `/addfriend <id>` | ➕ **Add Friend**: Grant full access to a friend by Telegram User ID |
| `/removefriend <id>`| 🗑️ **Remove Friend**: Revoke access for a user |
| `/friends` | 👥 **Friends List**: View all authorized friends with quick revoke buttons |
| `/myid` | 🆔 **My Identity**: View your Telegram User ID, role, and current access status |
| `/scanmargin` | 📐 **QCAB Margin Scanner**: Audit presentation, margins, overflow & formatting |
| `/mockhall` | 🏛️ **3-Hr Mock Hall**: Launch or view 180-min (250 Marks) full exam simulation |
| `/mockstatus` | ⏱️ **Mock Status**: Check time remaining and milestone alerts |
| `/mocksubmit` | 🏁 **Submit Mock**: Conclude mock exam and generate endurance report |
| `/newstomains` | 📰 **News to Mains**: Transform editorial/news snippet into 10M & 15M questions |
| `/levelup` | 🚀 **Level-Up Answer**: Upgrade 7/15 draft into 13/15 topper-grade answer |
| `/leaderboard` | 🏆 **Leaderboard**: View top study group aspirants and rankings |
| `/myrank` | 👤 **My Scorecard**: Check your rank, average score, streak & badges |
| `/print` | 🖨️ **Direct Print**: Dispatch QCAB booklet to Wi-Fi printer via IPP |
| `/setprinter <ip>` | ⚙️ **Configure Printer**: Set IPP printer IP/hostname and queue |
| `/badges` | 🎖️ **My Badges**: View earned achievement badges |
| `/studypolice` | 👮 **Study Police**: View group anti-spam rules and focus mode |
| `/dart` | 🎯 **Dart Picker**: Throw animated dart for random 12-min topic challenge |
| `/tags` | 🏷️ **Hashtag Index**: Browse indexed syllabus topics and archives |
| `/tag <#tag>` | 🔍 **Search by Tag**: View questions and model answers under a tag |
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

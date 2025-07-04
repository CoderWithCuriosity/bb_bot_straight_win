const fs = require("fs");
const path = require("path");
const { DateTime } = require("luxon");

const { placeBet } = require("./api/bet");
const { win_1_5 } = require("./strategy/win_1_5");
const { analyzeLastNBets } = require("./utils/analyzeLastBets");

const X = 2; // Minutes between executions
const betPerX = 5;

const FILE_PATH = path.join(__dirname, "bets.json");
const TOKEN_PATH = path.join(__dirname, "token.json");
const COOLDOWN_FILE = path.join(__dirname, "cooldown.json");

const NIGERIA_TZ = "Africa/Lagos";

// Initialize files if not exist
if (!fs.existsSync(FILE_PATH)) {
  fs.writeFileSync(FILE_PATH, JSON.stringify([], null, 2), "utf8");
}
if (!fs.existsSync(TOKEN_PATH)) {
  fs.writeFileSync(
    TOKEN_PATH,
    JSON.stringify([{ token: "", secretKey: "" }], null, 2),
    "utf8"
  );
}

function getLoginData() {
  const data = fs.readFileSync(TOKEN_PATH, "utf8");
  return JSON.parse(data)[0];
}

function storeLoginData(credentials) {
  if (credentials.token && credentials.secretKey) {
    fs.writeFileSync(
      TOKEN_PATH,
      JSON.stringify([{ token: credentials.token, secretKey: credentials.secretKey }], null, 2),
      "utf8"
    );
  }
}

function logBet(bet) {
  let existing = [];
  try {
    const raw = fs.readFileSync(FILE_PATH, "utf8");
    existing = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(existing)) throw new Error("Invalid format");
  } catch {
    console.log("⚠️ bets.json missing or corrupted. Starting fresh.");
    existing = [];
  }

  existing.push({
    ...bet,
    placedAt: DateTime.now().setZone(NIGERIA_TZ).toISO(),
  });

  fs.writeFileSync(FILE_PATH, JSON.stringify(existing, null, 2), "utf8");
}

function setCooldownToNextHour() {
  const now = DateTime.now().setZone(NIGERIA_TZ);
  const nextHour = now.plus({ hours: 1 }).startOf("hour");

  fs.writeFileSync(
    COOLDOWN_FILE,
    JSON.stringify({ resumeTime: nextHour.toISO() }, null, 2),
    "utf8"
  );

  console.log(`🔒 Cooldown set until: ${nextHour.toFormat("yyyy-MM-dd HH:mm:ss")} (Africa/Lagos)`);
}

function isInCooldown() {
  if (!fs.existsSync(COOLDOWN_FILE)) return false;

  try {
    const data = JSON.parse(fs.readFileSync(COOLDOWN_FILE, "utf8"));
    const resumeTime = DateTime.fromISO(data.resumeTime, { zone: NIGERIA_TZ });
    const now = DateTime.now().setZone(NIGERIA_TZ);

    if (now >= resumeTime) {
      fs.unlinkSync(COOLDOWN_FILE);
      console.log("✅ Cooldown expired. Resuming betting...");
      return false;
    }

    const minsLeft = Math.ceil(resumeTime.diff(now, "minutes").minutes);
    console.log(`⏸️ Cooldown active. Resume in ${minsLeft} minute(s).`);
    return true;
  } catch (err) {
    console.log("⚠️ Invalid cooldown.json. Ignoring cooldown.");
    return false;
  }
}

async function main() {
  if (isInCooldown()) return;

  let placedAnyBet = false;

  const last3Results = await analyzeLastNBets(3);
  const last3Losses = last3Results.filter((x) => x === false);

  const credentials = getLoginData();
  if (!credentials || !credentials.token || !credentials.secretKey) {
    console.log("❌ Token not found! Please refresh credentials.");
    return;
  }

  const last2Results = await analyzeLastNBets(2, true);
  const last2Wins = last2Results.filter((x) => x === true);
  const stake = last2Wins.length === 2 ? 200 : 100;

  const [selections] = await win_1_5(stake, betPerX);

  let existingBets = [];
  try {
    const raw = fs.readFileSync(FILE_PATH, "utf8");
    existingBets = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(existingBets)) throw new Error("Invalid format");
  } catch {
    console.log("⚠️ bets.json missing or invalid. Resetting file.");
    fs.writeFileSync(FILE_PATH, JSON.stringify([], null, 2), "utf8");
    existingBets = [];
  }

  if (selections.length) {
    console.log(`🎯 Found ${selections.length} strategic matches:`);

    for (const sel of selections) {
      const alreadyPlaced = existingBets.some(
        (b) => b.eventId === sel.eventId && b.outcomeId === sel.outcomeId
      );

      if (alreadyPlaced) {
        console.log(`⚠️ Already bet on ${sel.eventName} - Skipping...`);
        continue;
      }

      console.log(`🟢 Bet: ${sel.eventName} (${sel.outcomeName} @ ${sel.odds})`);

      await placeBet(
        credentials.token,
        credentials.secretKey,
        [sel],
        storeLoginData
      );

      placedAnyBet = true;
      logBet(sel);
    }
  }

  if (last3Losses.length === 3 && placedAnyBet) {
    console.log("🚨 3 consecutive losses after bet. Pausing until next hour.");
    setCooldownToNextHour();
    return;
  }
}

// Run immediately on start
console.log(`[${DateTime.now().setZone(NIGERIA_TZ).toFormat("yyyy-MM-dd HH:mm:ss")}] ✅ Starting auto-bet...`);
main();

// Repeat every X minutes
setInterval(main, X * 60 * 1000);


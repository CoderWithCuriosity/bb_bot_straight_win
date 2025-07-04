const { placeBet } = require("./api/bet");
const fs = require("fs");
const path = require("path");
const { win_1_5 } = require("./strategy/win_1_5");
const { analyzeLastNBets } = require("./utils/analyzeLastBets");

const X = 2; // Minutes between executions
const betPerX = 5; // How many matches to bet on

const FILE_PATH = path.join(__dirname, "bets.json");
const TOKEN_PATH = path.join(__dirname, "token.json");
const COOLDOWN_FILE = path.join(__dirname, "cooldown.json");

// Initialize storage files if they don't exist
if (!fs.existsSync(FILE_PATH))
  fs.writeFileSync(FILE_PATH, JSON.stringify([]), "utf8");
if (!fs.existsSync(TOKEN_PATH))
  fs.writeFileSync(
    TOKEN_PATH,
    JSON.stringify([{ token: "", secretKey: "" }]),
    "utf8"
  );

function getLoginData() {
  const data = fs.readFileSync(TOKEN_PATH, "utf8");
  const parseData = JSON.parse(data);
  return parseData[0];
}

function storeLoginData(credentials) {
  if (credentials.token && credentials.secretKey) {
    const credentialsData = [
      { token: credentials.token, secretKey: credentials.secretKey }
    ];
    fs.writeFileSync(
      TOKEN_PATH,
      JSON.stringify(credentialsData, null, 2),
      "utf8"
    );
  }
}

function logBet(bet) {
  const existing = JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));
  existing.push({
    ...bet,
    placedAt: new Date().toISOString()
  });
  fs.writeFileSync(FILE_PATH, JSON.stringify(existing, null, 2), "utf8");
}

function isInCooldown() {
  if (!fs.existsSync(COOLDOWN_FILE)) return false;

  const data = JSON.parse(fs.readFileSync(COOLDOWN_FILE, "utf8"));
  const resumeTime = new Date(data.resumeTime);
  return new Date() < resumeTime;
}

function setCooldownToNextHour() {
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setMinutes(0, 0, 0); // Set to start of current hour
  nextHour.setHours(now.getHours() + 1); // Add 1 hour

  fs.writeFileSync(
    COOLDOWN_FILE,
    JSON.stringify({ resumeTime: nextHour.toISOString() }),
    "utf8"
  );
}

async function main() {
  if (isInCooldown()) {
    console.log("⏸️ In cooldown until next hour. Waiting...");
    return;
  }

  // Analyze last 3 bets
  const last3Results = await analyzeLastNBets(3);
  const last3Losses = last3Results.filter(x => x === false);

  if (last3Losses.length === 3) {
    console.log("🚨 3 consecutive losses detected. Pausing until next hour.");
    setCooldownToNextHour();
    return;
  }

  const credentials = getLoginData();
  if (!credentials || !credentials.token || !credentials.secretKey) {
    console.log("❌ Token not found! Please refresh credentials.");
    return;
  }
  

    // 📈 Check last 2 bets to reward winning streak
  const last2Results = await analyzeLastNBets(2);
  const last2Wins = last2Results.filter(x => x === true);

  const stake = last2Wins.length === 2 ? 200 : 100;

  const [selections] = await win_1_5(stake, betPerX);

  if (selections.length) {
    const existingBets = JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));
    console.log(`🎯 Found ${selections.length} strategic matches:`);

    for (const sel of selections) {
      const alreadyPlaced = existingBets.some(
        b => b.eventId === sel.eventId && b.outcomeId === sel.outcomeId
      );

      if (alreadyPlaced) {
        console.log(`⚠️ Already bet on ${sel.eventName} - Skipping...`);
        continue;
      }

      console.log(
        `🟢 Bet: ${sel.eventName} (${sel.outcomeName} @ ${sel.odds})`
      );
      await placeBet(
        credentials.token,
        credentials.secretKey,
        [sel],
        storeLoginData
      );
      logBet(sel); // Save to bets.json
    }
  }
}

// Run on launch
console.log(`[${new Date().toISOString()}] ✅ Starting auto-bet...`);
main();

// Repeat every X minutes
setInterval(main, X * 60 * 1000);

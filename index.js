const { placeBet } = require("./api/bet");
const fs = require("fs");
const path = require("path");
const { win_strategy } = require("./strategy/win_strategy");

const X = 2; // Minutes between executions
const betPerX = 5; // How many matches to bet on

const FILE_PATH = path.join(__dirname, "bets.json");
const TOKEN_PATH = path.join(__dirname, "token.json");

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

async function main() {
  console.log(`[${new Date().toISOString()}] ✅ Starting auto-bet...`);

  const credentials = getLoginData();
  if (!credentials || !credentials.token || !credentials.secretKey) {
    console.log("❌ Token not found! Please refresh credentials.");
    return;
  }

  const [selections] = await win_strategy(100, betPerX);

  if (selections.length) {
    console.log(`🎯 Found ${selections.length} strategic matches:`);

    for (const sel of selections) {
      console.log(
        `🟢 Bet: ${sel.eventName} (${sel.outcomeName} @ ${sel.odds})`
      );
      await placeBet(
        credentials.token,
        credentials.secretKey,
        [sel],
        storeLoginData
      );
      // Save to bets.json
      logBet(sel);
    }
  } else {
    console.log("⚠️ No valid 1X2 home selections found.");
  }
}

// Run on launch
main();

// Repeat every X minutes
setInterval(main, X * 60 * 1000);

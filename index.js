const { placeBet } = require("./api/bet");
const fs = require("fs");
const path = require("path");
const { win_1x2 } = require("./strategy/win_1x2");
const { processSeasonsFromWeek1 } = require("./utils/seasonProcessor");

const X = 2; // Minutes between executions
const betPerX = 50; // How many matches to bet on

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
  return JSON.parse(data)[0];
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
  const credentials = getLoginData();
  if (!credentials || !credentials.token || !credentials.secretKey) {
    console.log("❌ Token not found! Please refresh credentials.");
    return;
  }

  const stake = 100; // Fixed stake

  await processSeasonsFromWeek1();
  const [selections] = await win_1x2(stake, betPerX);

  if (!selections.length) {
    console.log("⚠️ No new selections found.");
    return;
  }

  const existingBets = JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));

  // Remove already placed bets
  const newSelections = selections.filter(sel => {
    const alreadyPlaced = existingBets.some(
      b => b.eventId === sel.eventId && b.outcomeId === sel.outcomeId
    );
    if (alreadyPlaced) {
      console.log(`⚠️ Already bet on ${sel.eventName} - Skipping...`);
      return false;
    }
    return true;
  });

  if (!newSelections.length) {
    console.log("⚠️ No new bets to place after removing duplicates.");
    return;
  }

  console.log(`🎯 Placing ${newSelections.length} new bets:`);

  // Sort by scheduled time and eventId
  newSelections.sort((a, b) => {
    if (a.scheduledTime !== b.scheduledTime) {
      return a.scheduledTime - b.scheduledTime;
    }
    return a.eventId.localeCompare(b.eventId);
  });

  try {
    // await placeBet(
    //   credentials.token,
    //   credentials.secretKey,
    //   newSelections,
    //   storeLoginData,
    //   stake
    // );


    newSelections.forEach(sel => logBet(sel));

    //For single staing 
    // for (const sel of newSelections) {
    //   try {
    //     await placeBet(
    //       credentials.token,
    //       credentials.secretKey,
    //       [sel], // Pass as array
    //       storeLoginData,
    //       stake
    //     );
    //     logBet(sel);
    //     console.log(`✅ Successfully placed bet on ${sel.eventName}`);
    //   } catch (err) {
    //     console.error(
    //       `❌ Failed to place bet on ${sel.eventName}:`,
    //       err.message || err
    //     );
    //   }
    // }
  } catch (err) {
    console.error("❌ Failed to place bet:", err.message || err);
  }
}

// Run on launch
console.log(`[${new Date().toISOString()}] ✅ Starting auto-bet...`);
main();

// Repeat every X minutes
setInterval(main, X * 60 * 1000);

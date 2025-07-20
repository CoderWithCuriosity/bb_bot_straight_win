const fs = require("fs");
const path = require("path");
const { getMatchOdds } = require("../../api/matches");
const { DateTime } = require("luxon");

// 💰 Define your single bet amount here
const SINGLE_BET_AMOUNT = 100; // Change this to any stake you want

/**
 * Read and parse bets.json file
 */
function loadBets() {
  const filePath = path.join(__dirname, "../../bets.json");
  const rawData = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(rawData);
}

/**
 * Determine match result
 */
function determineResult(homeScore, awayScore) {
  if (homeScore > awayScore) return 1; // Home Win
  if (homeScore < awayScore) return 3; // Away Win
  return 2; // Draw
}

/**
 * Analyze bets and log wins/losses with odds & profit calculation
 */
async function analyzeAndLogWins(useCurrentHour = false) {
  const allBets = loadBets();

  let filteredBets = allBets;

  if (useCurrentHour) {
    const currentHour = DateTime.local().hour;

    filteredBets = allBets.filter(bet => {
      const betHour = DateTime.fromISO(bet.placedAt).hour;
      return betHour === currentHour;
    });
  }

  const lastBets = filteredBets;

  let wonCount = 0;
  let lostCount = 0;

  let totalWonOdds = 0;
  let totalLostOdds = 0;

  let totalReturn = 0;
  let totalStaked = 0;

  console.log("🔍 Checking bets...\n");

  for (const bet of lastBets) {
    const { eventId, outcomeId, eventName, odds } = bet;

    const matchData = await getMatchOdds(eventId);
    if (!matchData) {
      console.log(`❌ Could not fetch data for: ${eventName}`);
      continue;
    }

    // if(parseFloat(odds) < 1.3 || parseFloat(odds) > 1.5) continue;

    const { homeScore, awayScore, matchStatus, scheduledDate } = matchData;

    if (matchStatus !== "ended") {
      console.log(`⏳ Match not finished: ${eventName}`);
      continue;
    }

    totalStaked += SINGLE_BET_AMOUNT;

    const actualOutcome = determineResult(homeScore, awayScore);
    const won = parseInt(outcomeId) === actualOutcome;

    if (won) {
      const winReturn = SINGLE_BET_AMOUNT * odds;
      console.log(`✅ WON: ${eventName} | ${homeScore}-${awayScore} | Odds: ${odds} | Return: ₦${winReturn.toFixed(2)}\nTime: ${scheduledDate}\n`);
      wonCount++;
      totalWonOdds += odds;
      totalReturn += winReturn;
    } else {
      console.log(`❌ LOST: ${eventName} | ${homeScore}-${awayScore} | Odds: ${odds} | Lost: ₦${SINGLE_BET_AMOUNT}\nTime: ${scheduledDate}\n`);
      lostCount++;
      totalLostOdds += odds;
      // No return for lost bets
    }
  }

  const profit = totalReturn - totalStaked;

  console.log(`\n📊 Summary:`);
  console.log(`Total Won Bets: ${wonCount}`);
  console.log(`Total Lost Bets: ${lostCount}`);
  console.log(`Sum of Won Odds: ${totalWonOdds.toFixed(2)}`);
  console.log(`Sum of Lost Odds: ${totalLostOdds.toFixed(2)}`);
  console.log(`\n💰 Financial Summary:`);
  console.log(`Total Staked: ₦${totalStaked}`);
  console.log(`Total Return: ₦${totalReturn.toFixed(2)}`);
  console.log(`Net Profit/Loss: ₦${profit.toFixed(2)}\n`);

  if (profit > 0) {
    console.log("🎉 You made a profit!");
  } else if (profit < 0) {
    console.log("🔻 You made a loss.");
  } else {
    console.log("⚖️ Break-even, no profit or loss.");
  }
}

// Auto-run
analyzeAndLogWins();

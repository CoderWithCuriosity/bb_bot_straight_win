const fs = require("fs");
const path = require("path");
const { getMatchOdds } = require("../../api/matches");
const { DateTime } = require("luxon");

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
 * Analyze bets and log wins/losses with odds
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

  console.log("🔍 Checking bets...\n");

  for (const bet of lastBets) {
    const { eventId, outcomeId, eventName, odds } = bet;

    const matchData = await getMatchOdds(eventId);
    if (!matchData) {
      console.log(`❌ Could not fetch data for: ${eventName}`);
      continue;
    }

    const { homeScore, awayScore, matchStatus } = matchData;

    if (matchStatus !== "ended") {
      console.log(`⏳ Match not finished: ${eventName}`);
      continue;
    }

    const actualOutcome = determineResult(homeScore, awayScore);
    const won = parseInt(outcomeId) === actualOutcome;

    if (won) {
      console.log(`✅ WON: ${eventName} | ${homeScore}-${awayScore} | Odds: ${odds}`);
      wonCount++;
      totalWonOdds += odds;
    } else {
      console.log(`❌ LOST: ${eventName} | ${homeScore}-${awayScore} | Odds: ${odds}`);
      lostCount++;
      totalLostOdds += odds;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`Total Won Bets: ${wonCount}`);
  console.log(`Total Lost Bets: ${lostCount}`);
  console.log(`Sum of Won Odds: ${totalWonOdds.toFixed(2)}`);
  console.log(`Sum of Lost Odds: ${totalLostOdds.toFixed(2)}`);
}

// Auto-run
analyzeAndLogWins();

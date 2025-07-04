const fs = require("fs");
const path = require("path");
const { getMatchOdds } = require("../api/matches");
const { DateTime } = require("luxon");

/**
 * Read and parse bets.json file
 */
function loadBets() {
  const filePath = path.join(__dirname, "../bets.json");
  const rawData = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(rawData);
}

/**
 * Determine match result
 */
function determineResult(homeScore, awayScore) {
  if (homeScore > awayScore) return 1;
  if (homeScore < awayScore) return 3;
  return 2;
}

/**
 * Analyze last N bets placed within the current hour (local time)
 * Uses Luxon for date handling
 */
async function analyzeLastNBets(count = 3, useCurrentHour = false) {
  const allBets = loadBets();

  let filteredBets = allBets;

  if (useCurrentHour) {
    const currentHour = DateTime.local().hour;

    filteredBets = allBets.filter(bet => {
      const betHour = DateTime.fromISO(bet.placedAt).hour;
      return betHour === currentHour;
    });
  }

  const lastBets = filteredBets.slice(-count);
  const isWonArr = [];

  for (const bet of lastBets) {
    const { eventId, outcomeId, eventName } = bet;

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
    isWonArr.push(won);
  }

  return isWonArr;
}

module.exports = { analyzeLastNBets };
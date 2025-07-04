const fs = require("fs");
const path = require("path");
const { getMatchOdds } = require("../api/matches"); // Update this to your correct filename

/**
 * Read and parse bets.json file
 * @returns {Array} - Parsed bets array
 */
function loadBets() {
  const filePath = path.join(__dirname, "../bets.json");
  const rawData = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(rawData);
}

/**
 * Determine the actual result of a match
 * @param {number} homeScore
 * @param {number} awayScore
 * @returns {1 | 2 | 3} - 1 = Home Win, 2 = Draw, 3 = Away Win
 */
function determineResult(homeScore, awayScore) {
  if (homeScore > awayScore) return 1;
  if (homeScore < awayScore) return 3;
  return 2;
}

/**
 * Analyze the last N bets from bets.json
 * @param {number} count - Number of last bets to check
 */
async function analyzeLastNBets(count = 3) {
  const allBets = loadBets();
  const lastBets = allBets.slice(-count);
  const isWonArr = [];

  for (const bet of lastBets) {
    const { eventId, outcomeId, odds, outcomeName, eventName } = bet;

    const matchData = await getMatchOdds(eventId);
    if (!matchData) {
      console.log(`❌ Could not fetch data for match: ${eventName}`);
      continue;
    }

    const {
      homeTeamName,
      awayTeamName,
      homeScore,
      awayScore,
      matchStatus
    } = matchData;

    if (matchStatus !== "ended") {
      console.log(`⏳ Match not finished: ${eventName}`);
      continue;
    }

    const actualOutcome = determineResult(homeScore, awayScore);
    const won = parseInt(outcomeId) === actualOutcome;
    isWonArr.push(won);
  }

  //It returns [true, true, true]
  return isWonArr
}

module.exports = { analyzeLastNBets };

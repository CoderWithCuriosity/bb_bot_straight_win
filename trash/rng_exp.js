// 📁 strategy/gold_strategy.js
const {
  computeCurrentWeekStandings
} = require("../api/computeCurrentWeekStandings");
const {
  fetchFullTournamentData
} = require("../api/fetchFullTournamentData");
const {
  fetchMatchDaysDifference
} = require("../api/fetchMatchDays");
const {
  getMatchOdds,
  fetchMatches
} = require("../api/matches");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const {
  logShortOdds,
  last3ShortOddsLosses,
  logBTTSResult,
  shouldTriggerBTTSYes,
  logDraw,
  avoidNextZeroZero,
  storeMatchForResultCheck,
  updateAllPendingResults
} = require("./patternEngine");

const BOT_TOKEN = '7299748052:AAHJKWCStrsnSg_e5YfWctTNnVQYUlNp8Hs';
const USER_ID = '6524312327';
const FILE_PATH = path.join(__dirname, "../bets.json");

async function sendTelegramMessage(message) {
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: USER_ID,
      text: message,
      parse_mode: "Markdown"
    });
  } catch (err) {
    console.error("❌ Failed to send Telegram message:", err.message);
  }
}

async function gold_strategy(amount = 100, matchCount = 5) {
  const selections = [];

  // 🛠️ Update pending results before proceeding
  await updateAllPendingResults();

  const STRATEGIC_TOURNAMENTS = [
    { id: "vf:tournament:31867", name: "English League" },
    { id: "vf:tournament:14149", name: "League Mode" },
    { id: "vf:tournament:34616", name: "Bundesliga" }
  ];

  const fetched_matches = await fetchMatches();
  if (!fetched_matches.length) return [selections];

  for (const tournament of STRATEGIC_TOURNAMENTS) {
    const matchesData = await fetchFullTournamentData(tournament.id);
    if (!matchesData.length) continue;

    let [finishedMatchDay, standings] = computeCurrentWeekStandings(matchesData);
    if (finishedMatchDay < 5 || finishedMatchDay > 21) continue;

    const [startDayStamp, daysDiff] = await fetchMatchDaysDifference(tournament.id);
    if (!startDayStamp || !daysDiff) continue;

    for (const match of fetched_matches.filter(m => m.tournamentId === tournament.id)) {
      let matchDay = Math.floor((match.scheduledTime - startDayStamp) / daysDiff) + 1;
      const rankMap = {};
      standings.forEach((team, i) => (rankMap[team.team] = i + 1));

      const home = match.homeTeamName;
      const away = match.awayTeamName;
      const homeRank = rankMap[home];
      const awayRank = rankMap[away];
      const totalTeams = standings.length;
      const bottomStart = totalTeams - 5 + 1;

      const existingBets = JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));
      if (existingBets.some(b => b.eventId === match.id)) continue;

      const oddsData = await getMatchOdds(match.id);
      if (!oddsData?.marketList?.length) continue;

      for (const market of oddsData.marketList) {
        if (market.name === "1x2") {
          for (const detail of market.markets) {
            for (const outcome of detail.outcomes) {
              const isShort = outcome.odds >= 1.2 && outcome.odds <= 1.5;
              const isIdeal = outcome.odds >= 1.75 && outcome.odds <= 2.75;

              // Short Odds Recovery
              if (isShort) {
                logShortOdds(match.id, outcome.odds, "L"); // Temporary log
                if (last3ShortOddsLosses()) {
                  selections.push({ ...baseSelection(match, market, outcome, amount) });
                  await sendTelegramMessage(`🎯 Odds Flip Pattern: ${match.name} @ ${outcome.odds}`);
                }
              }

              // Rank-Based Pick
              if (
                homeRank >= 3 && homeRank <= 5 &&
                awayRank >= bottomStart && awayRank <= totalTeams &&
                isIdeal &&
                outcome.desc.toLowerCase() === oddsData.homeTeamName.toLowerCase()
              ) {
                selections.push({ ...baseSelection(match, market, outcome, amount) });
                await sendTelegramMessage(`🏆 Rank-Based: ${match.name} | Odds: ${outcome.odds}`);
              }
            }
          }
        }
      }

      // Queue this match to update result later
      storeMatchForResultCheck(match);

      // Simulated logging (real outcome logged later)
    //   logBTTSResult(match.id, "NO"); // Simulated
    //   logDraw(match.id, "0-0"); // Simulated

      if (shouldTriggerBTTSYes()) {
        await sendTelegramMessage(`🔁 BTTS Recovery Suggestion Detected`);
      }

      if (avoidNextZeroZero()) {
        await sendTelegramMessage(`⚠️ Avoid 0-0: ${match.name}`);
      }

      if (selections.length >= matchCount) break;
    }
  }

  return [selections];
}

function baseSelection(match, market, outcome, amount) {
  return {
    sportId: match.sportId,
    eventId: match.id,
    producer: match.producer,
    marketId: market.id,
    specifiers: "",
    outcomeId: outcome.id,
    amount,
    odds: outcome.odds,
    specifierKeys: "",
    eventName: match.name,
    scheduledTime: match.scheduledTime,
    marketName: market.name,
    outcomeName: outcome.desc,
    categoryId: match.categoryId,
    tournamentId: match.tournamentId
  };
}

module.exports = { gold_strategy };
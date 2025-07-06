// strategy/win_straight.js

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { fetchMatches, getMatchOdds } = require("../api/matches");
const { fetchMatchDaysDifference, fetchSeasonId } = require("../api/fetchMatchDays");

const BOT_TOKEN = '7299748052:AAHJKWCStrsnSg_e5YfWctTNnVQYUlNp8Hs';
const USER_ID = '6524312327';

const STRATEGIC_TOURNAMENTS = [
  { id: "vf:tournament:31867", name: "English League" },
  { id: "vf:tournament:14149", name: "League Mode" },
  { id: "vf:tournament:34616", name: "Bundesliga" },
];

const SEASON_FILE = path.join(__dirname, "../tournament_data.json");

async function sendTelegramMessage(message) {
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: USER_ID,
      text: message,
      parse_mode: "Markdown",
    });
  } catch (err) {
    console.error("❌ Failed to send Telegram message:", err.message);
  }
}

function loadSeasonStandings() {
  if (!fs.existsSync(SEASON_FILE)) return [];
  return JSON.parse(fs.readFileSync(SEASON_FILE, "utf-8"));
}

function getTeamStats(standingsData, tournamentId, seasonId, teamName) {
  const tournament = standingsData.find((t) => t.tournamentId === tournamentId);
  if (!tournament) return null;

  const season = tournament.seasons?.find((s) => s.seasonId === seasonId);
  if (!season) return null;

  const team = season.teams?.find((t) => t.name === teamName);
  if (!team) return null;

  return {
    attack: team.attack,
    defense: team.defense,
    strength: team.strength,
    chaos: team.chaos,
  };
}


async function straight_win(amount = 100, matchCount = 5) {
  const selections = [];
  const valid_matches = await fetchMatches();
  const standingsData = loadSeasonStandings();
  
  for (const tournament of STRATEGIC_TOURNAMENTS) {
    const [startDayStamp, daysDiff] = await fetchMatchDaysDifference(tournament.id);
    const seasonId = await fetchSeasonId(tournament.id);
    
    for (const match of valid_matches) {
      if (match.tournamentId !== tournament.id) continue;

      const matchDay = Math.floor((match.scheduledTime - startDayStamp) / daysDiff) + 1;

      const home = match.homeTeamName;
      const away = match.awayTeamName;

      const homeStats = getTeamStats(standingsData, tournament.id, seasonId, home);
      const awayStats = getTeamStats(standingsData, tournament.id, seasonId, away);
      if (!homeStats || !awayStats) continue;

      console.log(`📊 ${home} [Attack: ${homeStats.attack}, Chaos: ${homeStats.chaos}]`);
console.log(`📊 ${away} [Attack: ${awayStats.attack}, Chaos: ${awayStats.chaos}]\n`);

      // 🧠 Apply strict condition: One team must satisfy (A), and the other must satisfy (B)
      let predictedWinner = null;

      const homeQualifiesA = homeStats.attack >= 6 && homeStats.chaos < 4 || homeStats.attack >= 6 && homeStats.chaos > 6;
      const awayQualifiesB = awayStats.attack < 5 && awayStats.chaos < 5 || awayStats.attack < 5 && awayStats.chaos < 3;

      const awayQualifiesA = awayStats.attack >= 6 && awayStats.chaos < 4 || awayStats.attack >= 6 && awayStats.chaos > 6;
      const homeQualifiesB = homeStats.attack < 5 && homeStats.chaos < 5 || homeStats.attack < 5 && homeStats.chaos < 3 ;

      if (homeQualifiesA && awayQualifiesB) {
        predictedWinner = home;
      } else if (awayQualifiesA && homeQualifiesB) {
        predictedWinner = away;
      } else {
        continue; // ❌ No qualifying team
      }

      const oddsData = await getMatchOdds(match.id);
      if (!oddsData?.marketList?.length) continue;

      for (const market of oddsData.marketList) {
        if (market.name === "1x2") {
          for (const detail of market.markets) {
            for (const outcome of detail.outcomes) {
              if (outcome.desc !== predictedWinner) continue;

              if (outcome.odds < 1.3 || outcome.odds > 3.6) continue;

              const msg = `📊 *Straight Win Pick*\n\n🏆 *Tournament:* ${tournament.name}\n🕐 *Week:* ${matchDay}\n⚽ *Match:* ${home} vs ${away}\nMatch Id: ${oddsData.id}\n✅ *Pick:* ${predictedWinner}\n📈 *Odds:* ${outcome.odds}`;
              await sendTelegramMessage(msg);

              selections.push({
                sportId: match.sportId,
                eventId: match.id,
                producer: match.producer,
                marketId: market.id,
                specifiers: "",
                outcomeId: outcome.id,
                amount: amount,
                odds: outcome.odds,
                specifierKeys: "",
                eventName: match.name,
                scheduledTime: match.scheduledTime,
                marketName: market.name,
                outcomeName: outcome.desc,
                categoryId: match.categoryId,
                tournamentId: match.tournamentId,
              });

              if (selections.length >= matchCount) return [selections];
            }
          }
        }
      }
    }
  }

  return [selections];
}

module.exports = { straight_win };

const { computeCurrentWeekStandings } = require("../api/computeCurrentWeekStandings");
const { fetchFullTournamentData } = require("../api/fetchFullTournamentData");
const { getMatchOdds } = require("../api/matches");
const axios = require('axios');
const BOT_TOKEN = '7299748052:AAHJKWCStrsnSg_e5YfWctTNnVQYUlNp8Hs';
const USER_ID = '6524312327';

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


async function win_strategy(amount = 100, matchCount = 5) {
    const selections = [];

    const STRATEGIC_TOURNAMENTS = [
        { id: 'vf:tournament:31867', name: 'English League' },
        { id: 'vf:tournament:14149', name: 'League Mode' },
        { id: 'vf:tournament:34616', name: 'Bundesliga' }
    ];

    for (const tournament of STRATEGIC_TOURNAMENTS) {
        console.log(`🎯 Scanning ${tournament.name}...`);
        const matchesData = await fetchFullTournamentData(tournament.id);
        if (!matchesData.length) continue;

        const [matchDay, standings] = computeCurrentWeekStandings(matchesData);
        if (matchDay < 6 || matchDay > 22) {
            // console.log(`⏭️ Skipping ${tournament.name} — Not in MD6–22 range. Current Week is ${matchDay}`);
            continue;
        }

        const latestMatches = matchesData.find(day => day.number === matchDay);
        if (!latestMatches) continue;

        const rankMap = {};
        standings.forEach((team, i) => {
            rankMap[team.team] = i + 1;
        });

        for (const match of latestMatches.matches) {
            const home = match.homeTeamName;
            const away = match.awayTeamName;
            const homeRank = rankMap[home];
            const awayRank = rankMap[away];

            if (
                homeRank >= 3 && homeRank <= 5 &&
                awayRank >= 14 && awayRank <= 18
            ) {
                    // 🟢 Send Telegram message BEFORE checking odds
    const msg = `📊 *Strategic Match Found*\n\n🏆 *Tournament:* ${tournament.name}\n🕐 *Week:* ${matchDay}\n⚽ *Match:* ${home} vs ${away}\n📌 *Home Rank:* ${homeRank}\n📌 *Away Rank:* ${awayRank}\n\n🧠 Checking odds next...`;
    await sendTelegramMessage(msg);
                const oddsData = await getMatchOdds(match.id);
                if (!oddsData?.marketList?.length) continue;

                for (const market of oddsData.marketList) {
                    if (market.name === "1x2") {
                        for (const detail of market.markets) {
                            for (const outcome of detail.outcomes) {
                                if (
                                    outcome.desc.toLowerCase() !== oddsData.homeTeamName.toLowerCase() ||
                                    outcome.odds < 1.5 ||
                                    outcome.odds > 1.75
                                ) continue;

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
                                    tournamentId: match.tournamentId
                                });
                            }
                        }
                    }
                }
            } else {
                console.log(`Current Week: ${matchDay}. Home Team: ${match.homeTeamName} (Rank: ${homeRank}) vs Away Team: ${match.awayTeamName} (Rank: ${awayRank})`);
            }

            if (selections.length >= matchCount) break;
        }

        if (selections.length >= matchCount) {
            console.log(`Current Week: ${matchDay}. But No match with home rank between 3 to 5 and away rank from 14 to 18`)
            break
        };
    }

    return [selections];
}

module.exports = { win_strategy };

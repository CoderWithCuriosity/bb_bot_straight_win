const { computeCurrentWeekStandings } = require("../api/computeCurrentWeekStandings");
const { fetchFullTournamentData } = require("../api/fetchFullTournamentData");
const { fetchMatchDaysDifference } = require("../api/fetchMatchDays");
const { getMatchOdds, fetchMatches } = require("../api/matches");
const fs = require("fs");
const path = require("path");
const { DateTime } = require("luxon");

const axios = require('axios');
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

function shouldBetNow() {
    // Get current time in Africa/Lagos (Nigerian time)
    const hour = DateTime.now().setZone("Africa/Lagos").hour;

    const restrictedHours = [
        1, 2,    // 1–2 AM
        5, 6,    // 5–6 AM
        9, 10,   // 9–10 AM
        13, 14,  // 1–2 PM
        17, 18,  // 5–6 PM
        21, 22   // 9–10 PM
    ];

    return !restrictedHours.includes(hour);
}




async function win_strategy(amount = 100, matchCount = 5) {
    const selections = [];

    const STRATEGIC_TOURNAMENTS = [
        { id: 'vf:tournament:31867', name: 'English League' },
        { id: 'vf:tournament:14149', name: 'League Mode' },
        { id: 'vf:tournament:34616', name: 'Bundesliga' }
    ];

    if (!shouldBetNow()) {
        console.log("⏳ Betting is restricted during this hour.");
        return [selections];
    }

    const fetched_matches = await fetchMatches();
    const valid_matches = [];
    for (let match of fetched_matches) {
        for (let tournament of STRATEGIC_TOURNAMENTS) {
            if (match.tournamentId == tournament.id) {
                valid_matches.push(match);
                break;
            }
        }
    }
    if (valid_matches.length <= 0) return [selections];

    for (const tournament of STRATEGIC_TOURNAMENTS) {
        console.log(`🎯 Scanning ${tournament.name}...`);
        const matchesData = await fetchFullTournamentData(tournament.id);
        if (!matchesData.length) continue;
        // console.log(matchesData);

        let [finishedMatchDay, standings] = computeCurrentWeekStandings(matchesData);
        //This is because the fetchfulltourname data only fetches matches that is finished. so 6 is the week that is playing or not started. And for > 21 means that 22 and if 22 is finished the playing or not started is 23
        if (finishedMatchDay < 5 || finishedMatchDay > 21) {
            // console.log(`⏭️ Skipping ${tournament.name} — Not in MD6–22 range. Current Week is ${matchDay}`);
            continue;
        }

        const [startDayStamp, daysDiff] = await fetchMatchDaysDifference(tournament.id);

        if (!startDayStamp || !daysDiff) {
            console.log(`⛔ Skipping ${tournament.name} — startDayStamp or daysDiff missing.`);
            continue;
        }


        for (const match of valid_matches) {
            if (match.tournamentId != tournament.id) continue;
            //this is because since the last match is finished the next matches has to be playing so the current day has to be 
            // console.log(`This is Formular the time from the week (match scheduledTime) ${match.scheduledTime} minus the start day stamp ${startDayStamp} divided by daysDiff ${daysDiff} plus 1`);
            let matchDay = Math.floor((match.scheduledTime - startDayStamp) / daysDiff) + 1;

            const rankMap = {};
            standings.forEach((team, i) => {
                rankMap[team.team] = i + 1;
            });

            const home = match.homeTeamName;
            const away = match.awayTeamName;
            const homeRank = rankMap[home];
            const awayRank = rankMap[away];
            const totalTeams = standings.length;
            const bottomStart = totalTeams - 5 + 1; // bottom 5 teams: ranks 14–18 if 18 teams

            if (
                homeRank >= 3 && homeRank <= 5 &&
                awayRank >= bottomStart && awayRank <= totalTeams
            ) {
                const existingBets = JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));
                const alreadyPlaced = existingBets.some(
                    b => b.eventId === match.id
                );
                if(alreadyPlaced) continue;
                const oddsData = await getMatchOdds(match.id);
                if (!oddsData?.marketList?.length) continue;

                for (const market of oddsData.marketList) {
                    if (market.name === "1x2") {
                        for (const detail of market.markets) {
                            for (const outcome of detail.outcomes) {
                                if (
                                    outcome.desc.toLowerCase() !== oddsData.homeTeamName.toLowerCase() ||
                                    outcome.odds < 1.75 ||
                                    outcome.odds > 2.75
                                ) continue;
                                // 🟢 Send Telegram message After checking odds
                                const msg = `📊 *Strategic Match Found*\n\n🏆 *Tournament:* ${tournament.name}\n🕐 *Week:* ${matchDay}\n⚽ *Match:* ${home}` + ` vs ${away}\n📌 *Home Rank:* ${homeRank}\n📌 *Away Rank:* ${awayRank}\n🆔Match ID: ${match.id}\n\n\n🧠 Odds: ${outcome.odds}`;
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
                                    tournamentId: match.tournamentId
                                });
                            }
                        }
                    }
                }
            } else {
                console.log(`Current Week: ${matchDay}. Home Team: ${match.homeTeamName} (Rank: ${homeRank}) vs Away Team: ${match.awayTeamName} (Rank: ${awayRank})`);
            }

            if (selections.length >= matchCount) {
                console.log(`Current Week: ${matchDay}. But No match with home rank between 3 to 5 and away rank from 14 to 18`)
                break
            };
        }

    }

    return [selections];
}

module.exports = { win_strategy };

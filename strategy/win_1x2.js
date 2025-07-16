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

const SEASON_STATS_FILE = path.join(__dirname, "../season_standings.json");
const TOURNAMENT_DATA_FILE = path.join(__dirname, "../tournament_data.json");

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

function loadJSON(filePath) {
    if (!fs.existsSync(filePath)) return [];
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function getTeamAttributes(tournamentData, tournamentId, seasonId, teamName) {
    const tournament = tournamentData.find(t => t.tournamentId === tournamentId);
    if (!tournament) return null;
    const season = tournament.seasons?.find(s => s.seasonId === seasonId);
    if (!season) return null;
    return season.teams?.find(t => t.name === teamName) || null;
}

function getMaxDraws(seasonStandings, tournamentId, seasonId) {
    const tournament = seasonStandings.find(t => t.tournamentId === tournamentId);
    if (!tournament) return 0;

    const season = tournament.seasons.find(s => s.seasonId === seasonId);
    if (!season) return 0;

    const drawsArray = season.standings.map(team => team.D);
    const highestDraw = Math.max(...drawsArray);

    return highestDraw;
}




async function win_1x2(amount = 100, matchCount = 5) {
    const selections = [];
    const validMatches = await fetchMatches();
    const seasonStandings = loadJSON(SEASON_STATS_FILE);
    const tournamentData = loadJSON(TOURNAMENT_DATA_FILE);

    for (const tournament of STRATEGIC_TOURNAMENTS) {
        const [startDayStamp, daysDiff] = await fetchMatchDaysDifference(tournament.id);
        const seasonId = await fetchSeasonId(tournament.id);

        for (const match of validMatches) {
            if (match.tournamentId !== tournament.id) continue;

            const matchDay = Math.floor((match.scheduledTime - startDayStamp) / daysDiff) + 1;
            if (matchDay < 5) continue;

            const home = match.homeTeamName;
            const away = match.awayTeamName;

            const homeStats = getTeamAttributes(tournamentData, tournament.id, seasonId, home);
            const awayStats = getTeamAttributes(tournamentData, tournament.id, seasonId, away);
            if (!homeStats || !awayStats) continue;

            const highestDraw = getMaxDraws(seasonStandings, tournament.id, seasonId);
            const maxAllowedDraws = Math.floor(highestDraw / 2);

            const homeDrawsInForm = homeStats.form.filter(f => f === "D").length;
            const awayDrawsInForm = awayStats.form.filter(f => f === "D").length;

            if (homeDrawsInForm > maxAllowedDraws || awayDrawsInForm > maxAllowedDraws) continue;

            const oddsData = await getMatchOdds(match.id);
            if (!oddsData?.marketList?.length) continue;

            for (const market of oddsData.marketList) {
                if (market.name !== "Double chance") continue;

                for (const detail of market.markets) {
                    for (const outcome of detail.outcomes) {
                        if (parseInt(outcome.id) !== 10) continue;

                        const msg = `📊 *Double Chance Pick*\n\n🏆 *${tournament.name}*\n🕐 *Week:* ${matchDay}\n⚽ *${home} vs ${away}*\n\n💸 *Odds:* ${outcome.odds}\n🆔 *Match ID:* ${oddsData.id}\n\n *Home Draw in Form:* ${homeDrawsInForm}\n\n *Away Draw in Form: * ${awayDrawsInForm}`;
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

    // Final check if loop ends but selections are filled
    if (selections.length) {
        const totalOdds = selections.reduce((sum, s) => sum + parseFloat(s.odds), 0);
        if (totalOdds >= 1.7) {
            return [selections];
        } else {
            console.log("❌ Odds condition failed. Skipping bet.");
            return [[]];
        }
    }

    return [[]];
}

module.exports = { win_1x2 };

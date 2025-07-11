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

function loadSeasonStandings() {
    if (!fs.existsSync(SEASON_STATS_FILE)) return [];
    return JSON.parse(fs.readFileSync(SEASON_STATS_FILE, "utf-8"));
}

function loadTournamentData() {
    if (!fs.existsSync(TOURNAMENT_DATA_FILE)) return [];
    return JSON.parse(fs.readFileSync(TOURNAMENT_DATA_FILE, "utf-8"));
}

function getTeamAttributes(tournamentData, tournamentId, seasonId, teamName) {
    const tournament = tournamentData.find(t => t.tournamentId === tournamentId);
    if (!tournament) return null;

    const season = tournament.seasons?.find(s => s.seasonId === seasonId);
    if (!season) return null;

    return season.teams?.find(t => t.name === teamName) || null;
}

function getTeamStanding(seasonStandings, tournamentId, seasonId, teamName) {
    const tournament = seasonStandings.find(t => t.tournamentId === tournamentId);
    if (!tournament) return null;

    const season = tournament.seasons?.find(s => s.seasonId === seasonId);
    if (!season) return null;

    return season.standings?.find(t => t.team === teamName) || null;
}

function markStat(value, type = "normal") {
    if (type === "chaos") {
        if (value < 4) return `🟢 ${value}`;
        if (value < 5) return `🟡 ${value}`;
        return `🔴 ${value}`;
    } else {
        if (value >= 6) return `🟢 ${value}`;
        if (value >= 5) return `🟡 ${value}`;
        return `🔴 ${value}`;
    }
}

async function win_1x2(amount = 100, matchCount = 5) {
    const selections = [];
    const valid_matches = await fetchMatches();
    const seasonStandings = loadSeasonStandings();
    const tournamentData = loadTournamentData();

    for (const tournament of STRATEGIC_TOURNAMENTS) {
        const [startDayStamp, daysDiff] = await fetchMatchDaysDifference(tournament.id);
        const seasonId = await fetchSeasonId(tournament.id);

        for (const match of valid_matches) {
            if (match.tournamentId !== tournament.id) continue;

            const matchDay = Math.floor((match.scheduledTime - startDayStamp) / daysDiff) + 1;
            if(matchDay < 6){
                continue;
            }
            // const maxAllowedDraws = Math.floor(matchDay / 2);
            const maxAllowedDraws = matchDay > 10 ? 6 : Math.floor(matchDay / 2);

            const home = match.homeTeamName;
            const away = match.awayTeamName;

            const homeStats = getTeamAttributes(tournamentData, tournament.id, seasonId, home);
            const awayStats = getTeamAttributes(tournamentData, tournament.id, seasonId, away);
            if (!homeStats || !awayStats) continue;

            const homeStanding = getTeamStanding(seasonStandings, tournament.id, seasonId, home);
            const awayStanding = getTeamStanding(seasonStandings, tournament.id, seasonId, away);
            if (!homeStanding || !awayStanding) continue;

            if (homeStanding.D > maxAllowedDraws || awayStanding.D > maxAllowedDraws) continue;

            let predictedWinner = null;
            if (homeStanding.W > awayStanding.W && homeStanding.PTS > awayStanding.PTS) {
                predictedWinner = home;
            } else if (awayStanding.W > homeStanding.W && awayStanding.PTS > homeStanding.PTS) {
                predictedWinner = away;
            } else {
                continue;
            }

            const oddsData = await getMatchOdds(match.id);
            if (!oddsData?.marketList?.length) continue;

            for (const market of oddsData.marketList) {
                if (market.name === "1x2") {
                    for (const detail of market.markets) {
                        for (const outcome of detail.outcomes) {
                            if (outcome.desc !== predictedWinner) continue;
                            if (outcome.odds < 1.3 || outcome.odds > 3.6) continue;

                            const msg = `📊 *Straight Win Pick*\n\n🏆 *Tournament:* ${tournament.name}\n🕐 *Week:* ${matchDay}\n⚽ *Match:* ${home} vs ${away}\n\n*Home Stats:*\n- Position: ${homeStanding.PTS} pts (${homeStanding.W}W ${homeStanding.D}D ${homeStanding.L}L)\n- Attack: ${markStat(homeStats.attack)}\n- Defense: ${markStat(homeStats.defense)}\n- Strength: ${markStat(homeStats.strength)}\n- Chaos: ${markStat(homeStats.chaos, "chaos")}\n\n*Away Stats:*\n- Position: ${awayStanding.PTS} pts (${awayStanding.W}W ${awayStanding.D}D ${awayStanding.L}L)\n- Attack: ${markStat(awayStats.attack)}\n- Defense: ${markStat(awayStats.defense)}\n- Strength: ${markStat(awayStats.strength)}\n- Chaos: ${markStat(awayStats.chaos, "chaos")}\n\n✅ *Pick:* ${predictedWinner}\n💸 *Odds:* ${outcome.odds}\n🆔 Match ID: ${oddsData.id}`;

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

module.exports = { win_1x2 };

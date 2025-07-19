
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

function getTeamPos(seasonStandings, tournamentId, seasonId, teamName) {
    const tournament = seasonStandings.find(t => t.tournamentId === tournamentId);
    if (!tournament) return null;

    const season = tournament.seasons?.find(s => s.seasonId === seasonId);
    if (!season) return null;

    return season.standings?.findIndex(t => t.team === teamName) + 1 || null;
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

function has2Wins1Loss(form) {
    const wins = form.filter(r => r === "W").length;
    const losses = form.filter(r => r === "L").length;
    return wins >= 2 && losses === 1;
}

/**
 * Get highest (best) position the team has reached
 * Lower number is better in standings (1st place is best)
 */
function getHighestPosition(standings) {
    return Math.min(...standings.map(s => s.position));
}

/**
 * Get lowest (worst) position the team has reached
 * Higher number is worse
 */
function getLowestPosition(standings) {
    return Math.max(...standings.map(s => s.position));
}

/**
 * Check if the team is improving
 * Looks at last N weeks and checks if trend is moving to better positions
 */
function isTeamImproving(standings, recentWeeks = 4) {
    if (standings.length < 2) return false;

    // Sort by week (just in case data isn't ordered)
    const sorted = [...standings].sort((a, b) => a.week - b.week);

    const recent = sorted.slice(-recentWeeks);
    let improving = false;

    for (let i = 1; i < recent.length; i++) {
        if (recent[i].position < recent[i - 1].position) {
            // Improved compared to previous week
            improving = true;
        } else {
            improving = false; // Broke the improving trend
            break;
        }
    }

    return improving;
}

/**
 * Compare two teams' trends
 * Pick the team that is improving more OR the one with the better highest position if both are equal
 */
function compareTeamTrends(homeStanding, awayStanding) {
    const homeHigh = getHighestPosition(homeStanding.standings);
    const homeLow = getLowestPosition(homeStanding.standings);
    const homeTrend = isTeamImproving(homeStanding.standings);

    const awayHigh = getHighestPosition(awayStanding.standings);
    const awayLow = getLowestPosition(awayStanding.standings);
    const awayTrend = isTeamImproving(awayStanding.standings);

    console.log(`Home Team: High=${homeHigh}, Low=${homeLow}, Improving=${homeTrend}`);
    console.log(`Away Team: High=${awayHigh}, Low=${awayLow}, Improving=${awayTrend}`);

    if (homeTrend && !awayTrend) {
        return "HOME";
    } else if (!homeTrend && awayTrend) {
        return "AWAY";
    }
     else {
        // If both or none improving, pick the one with better highest position
        if (homeHigh < awayHigh) {
            return "HOME";
        } else if (awayHigh < homeHigh) {
            return "AWAY";
        } else {
            return "NO PICK"; // Same trends, no clear advantage
        }
    }
}



async function win_1x2(amount = 100, matchCount = 3) {
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

            const highestDraw = getMaxDraws(seasonStandings, tournament.id, seasonId);
            const maxAllowedDraws = Math.floor(highestDraw / 2);

            const home = match.homeTeamName;
            const away = match.awayTeamName;

            const homeStats = getTeamAttributes(tournamentData, tournament.id, seasonId, home);
            const awayStats = getTeamAttributes(tournamentData, tournament.id, seasonId, away);
            if (!homeStats || !awayStats) continue;

            const homeStanding = getTeamStanding(seasonStandings, tournament.id, seasonId, home);
            const awayStanding = getTeamStanding(seasonStandings, tournament.id, seasonId, away);

            const homePos = getTeamPos(seasonStandings, tournament.id, seasonId, home);
            const awayPos = getTeamPos(seasonStandings, tournament.id, seasonId, away);
            if (!homeStanding || !awayStanding) continue;

            if (homeStanding.D > maxAllowedDraws || awayStanding.D > maxAllowedDraws) continue;

            const oddsData = await getMatchOdds(match.id);
            if (!oddsData?.marketList?.length) continue;
            let selectedId;
            const pick = compareTeamTrends(homeStats, awayStats);
            if (pick === "HOME") {
                // Bet on Home
                selectedId = 1;
            } else if (pick === "AWAY") {
                selectedId = 3;
                // Bet on Away
            } else {
                continue;
                // Skip or consider Draw
            }


            for (const market of oddsData.marketList) {
                if (market.name === "1x2") {
                    for (const detail of market.markets) {
                        for (const outcome of detail.outcomes) {
                            if (parseInt(outcome.id) != selectedId) continue;

                                const msg = `🤝 *Straight Pick*\n\n🏆 *${tournament.name}*\n🕐 *Week:* ${matchDay}\n⚽ *${home} vs ${away}*\n\n💸 *Straight Pick Odds:* ${outcome.odds}\n🔢 *Draws in Form:* ${homeStanding.D}/${awayStanding.D}\n📊 *Pos:* ${homePos} vs ${awayPos}\n\n*Match Id:* ${oddsData.id}`;

                                await sendTelegramMessage(msg);
                                selections.push({
                                    sportId: match.sportId,
                                    eventId: match.id,
                                    producer: match.producer,
                                    marketId: market.id,
                                    specifiers: detail.specifiers,
                                    outcomeId: outcome.id,
                                    amount: amount,
                                    odds: outcome.odds,
                                    specifierKeys: detail.specifiersKeys,
                                    eventName: match.name,
                                    scheduledTime: match.scheduledTime,
                                    marketName: outcome.marketName,
                                    outcomeName: outcome.desc,
                                    categoryId: match.categoryId,
                                    tournamentId: match.tournamentId
                                });

                                if (selections.length >= matchCount) {
                                    return [selections];
                                }
                        }
                    }
                }
            }
        }
    }
    if (selections.length === 1) {
        const firstPick = selections[0];
        if (firstPick.odds < 1.5) {
            selections.pop();
        }
    }
    return [selections];
}

module.exports = { win_1x2 };


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
    if (standings.length < 2) {
        console.log('Not enough data to determine trend (less than 2 weeks)');
        return false;
    }

    // Sort by week (just in case data isn't ordered)
    const sorted = [...standings].sort((a, b) => a.week - b.week);
    const recent = sorted.slice(-recentWeeks);

    console.log(`Analyzing last ${recentWeeks} weeks: ${recent.map(s => s.position).join(' → ')}`);

    let improvingCount = 0;
    let totalComparison = 0;

    for (let i = 1; i < recent.length; i++) {
        if (recent[i].position < recent[i - 1].position) {
            console.log(`Week ${recent[i].week}: Improved from ${recent[i-1].position} to ${recent[i].position}`);
            improvingCount++;
        } else if (recent[i].position > recent[i - 1].position) {
            console.log(`Week ${recent[i].week}: Declined from ${recent[i-1].position} to ${recent[i].position}`);
        } else {
            console.log(`Week ${recent[i].week}: No change (${recent[i].position})`);
        }
        totalComparison++;
    }

    // Consider it improving if majority of recent comparisons show improvement
    const improvementRatio = improvingCount / totalComparison;
    console.log(`Improvement ratio: ${improvingCount}/${totalComparison} = ${improvementRatio.toFixed(2)}`);

    return improvementRatio >= 0.6; // At least 60% of recent weeks show improvement
}

/**
 * Compare two teams' trends
 * Pick the team that is improving more OR the one with the better highest position if both are equal
 */
function compareTeamTrends(homeStanding, awayStanding) {
    // Extract and analyze home team trends
    const homeStandings = homeStanding.standings || [];
    const homeCurrentPos = homeStandings[homeStandings.length - 1]?.position;
    const homeHigh = getHighestPosition(homeStandings);
    const homeLow = getLowestPosition(homeStandings);
    const homeTrend = isTeamImproving(homeStandings);
    const homeRecentForm = homeStanding.form || [];

    // Extract and analyze away team trends
    const awayStandings = awayStanding.standings || [];
    const awayCurrentPos = awayStandings[awayStandings.length - 1]?.position;
    const awayHigh = getHighestPosition(awayStandings);
    const awayLow = getLowestPosition(awayStandings);
    const awayTrend = isTeamImproving(awayStandings);
    const awayRecentForm = awayStanding.form || [];

    console.log('\n=== Team Trend Analysis ===');
    console.log('Home Team Analysis:');
    console.log(`- Current Position: ${homeCurrentPos}`);
    console.log(`- Best Position: ${homeHigh}`);
    console.log(`- Worst Position: ${homeLow}`);
    console.log(`- Improving Trend: ${homeTrend}`);
    console.log(`- Recent Form: ${homeRecentForm.join(', ')}`);
    console.log(`- Position History: ${homeStandings.map(s => s.position).join(' → ')}`);

    console.log('\nAway Team Analysis:');
    console.log(`- Current Position: ${awayCurrentPos}`);
    console.log(`- Best Position: ${awayHigh}`);
    console.log(`- Worst Position: ${awayLow}`);
    console.log(`- Improving Trend: ${awayTrend}`);
    console.log(`- Recent Form: ${awayRecentForm.join(', ')}`);
    console.log(`- Position History: ${awayStandings.map(s => s.position).join(' → ')}`);

    // Decision making with clear criteria
    if (homeTrend && !awayTrend) {
        console.log('\nDecision: HOME team has improving trend while AWAY does not');
        return "HOME";
    } else if (!homeTrend && awayTrend) {
        console.log('\nDecision: AWAY team has improving trend while HOME does not');
        return "AWAY";
    } else if (homeTrend && awayTrend) {
        // Both improving - compare the rate of improvement
        const homeImprovement = homeHigh - homeCurrentPos;
        const awayImprovement = awayHigh - awayCurrentPos;
        
        console.log(`\nBoth teams improving - HOME improvement: ${homeImprovement}, AWAY improvement: ${awayImprovement}`);
        
        if (homeImprovement > awayImprovement) {
            console.log('Decision: HOME team improving faster');
            return "HOME";
        } else if (awayImprovement > homeImprovement) {
            console.log('Decision: AWAY team improving faster');
            return "AWAY";
        }
    }

    // If no clear trend advantage, compare positions
    // console.log('\nNo clear trend advantage - comparing positions');
    // if (homeCurrentPos < awayCurrentPos) {
    //     console.log(`Decision: HOME team higher in standings (${homeCurrentPos} vs ${awayCurrentPos})`);
    //     return "HOME";
    // } else if (awayCurrentPos < homeCurrentPos) {
    //     console.log(`Decision: AWAY team higher in standings (${awayCurrentPos} vs ${homeCurrentPos})`);
    //     return "AWAY";
    // }

    // If still equal, compare form
    console.log('\nEqual positions - comparing recent form');
    const homeWins = homeRecentForm.filter(r => r === "W").length;
    const awayWins = awayRecentForm.filter(r => r === "W").length;
    
    if (homeWins > awayWins) {
        console.log(`Decision: HOME team has better form (${homeWins} wins vs ${awayWins})`);
        return "HOME";
    } else if (awayWins > homeWins) {
        console.log(`Decision: AWAY team has better form (${awayWins} wins vs ${homeWins})`);
        return "AWAY";
    }

    console.log('\nDecision: No clear advantage - no pick');
    return "NO PICK";
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
                            if(parseFloat(outcome.odds) > 2.0) continue;

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

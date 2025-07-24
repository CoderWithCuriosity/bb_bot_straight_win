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
    } catch (err) { }
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

function getHighestPosition(standings) {
    return Math.min(...standings.map(s => s.position));
}

function getLowestPosition(standings) {
    return Math.max(...standings.map(s => s.position));
}

function isTeamImproving(standings, recentWeeks = 4) {
    if (standings.length < 2) return false;

    const sorted = [...standings].sort((a, b) => a.week - b.week);
    const recent = sorted.slice(-recentWeeks);

    let improvingCount = 0;
    let totalComparison = 0;

    for (let i = 1; i < recent.length; i++) {
        if (recent[i].position < recent[i - 1].position) {
            improvingCount++;
        }
        totalComparison++;
    }

    const improvementRatio = improvingCount / totalComparison;
    return improvementRatio >= 0.6;
}

function analyzeForm(formArray, minMatches = 5) {
    if (!formArray || formArray.length < minMatches) return null;

    const recentForm = formArray.slice(-minMatches);
    const stats = { W: 0, D: 0, L: 0 };

    recentForm.forEach(result => stats[result]++);

    return {
        wins: stats.W,
        draws: stats.D,
        losses: stats.L,
        total: recentForm.length,
        winRate: (stats.W / recentForm.length) * 100,
        drawRate: (stats.D / recentForm.length) * 100,
        isImproving: stats.W > stats.L, // True if more wins than losses
    };
}

function compareTeamTrends(homeStanding, awayStanding) {
    const homeStandings = homeStanding.standings || [];
    const homeCurrentPos = homeStandings[homeStandings.length - 1]?.position;
    const homeHigh = getHighestPosition(homeStandings);
    const homeLow = getLowestPosition(homeStandings);

    const awayStandings = awayStanding.standings || [];
    const awayCurrentPos = awayStandings[awayStandings.length - 1]?.position;
    const awayHigh = getHighestPosition(awayStandings);
    const awayLow = getLowestPosition(awayStandings);

    if (homeLow < awayLow && homeHigh < awayHigh && homeCurrentPos < awayCurrentPos) {
        return "HOME";
    } else if (awayLow < homeLow && awayHigh < homeHigh && awayCurrentPos < homeCurrentPos) {
        return "AWAY";
    }

    return "NO PICK";
}

const FORM_ANALYSIS_LOG_FILE = path.join(__dirname, "../form_analysis_log.json");

function saveFormAnalysisLog(data) {
    let existing = [];
    if (fs.existsSync(FORM_ANALYSIS_LOG_FILE)) {
        existing = JSON.parse(fs.readFileSync(FORM_ANALYSIS_LOG_FILE, "utf-8"));
    }
    existing.push(data);
    fs.writeFileSync(FORM_ANALYSIS_LOG_FILE, JSON.stringify(existing, null, 2));
}


async function win_1_5(amount = 100, matchCount = 3) {
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
            if (matchDay < 6 || matchDay > 23) continue;

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


            // Analyze last 5 matches (min), up to 10 if available (if the match is less than 10 then the 5 - 2 else use 10)
            const homeForm = analyzeForm(homeStats.form, parseInt(matchDay) < 10 ? 5 : 10);
            const awayForm = analyzeForm(awayStats.form, parseInt(matchDay) < 10 ? 5 : 10);
            if (!homeForm || !awayForm) continue;
            if(homeForm.isImproving && awayForm.isImproving) continue;

            if (matchDay < 12) {
                if (homeForm.isImproving && awayForm.isImproving == false && homeForm.winRate >= 50 && awayForm.winRate < 50) {
                    selectedId = 1;
                }
                else if (awayForm.isImproving && awayForm.isImproving == false && awayForm.winRate >= 50 && homeForm.winRate < 50) {
                    selectedId = 3;
                }

                if (selectedId === 1 && homePos > awayPos) continue;
                if (selectedId === 3 && awayPos > homePos) continue;
            }


            console.log("Home Team: ", home, "\nPos: ", homePos);
            console.log(homeForm);
            console.log("Away Team: ", away, "\nPos: ", awayPos);
            console.log(awayForm)
            console.log("Pick: ", selectedId);

            const formData = {
                tournament: tournament.name,
                matchDay: matchDay,
                homeTeam: home,
                homePos: homePos,
                homeForm: homeForm,
                awayTeam: away,
                awayPos: awayPos,
                awayForm: awayForm,
                selectedPick: selectedId === 1 ? "HOME WIN" : selectedId === 3 ? "AWAY WIN" : "NO PICK"
            };

            // Save form analysis to file
            saveFormAnalysisLog(formData);

            // Format message for Telegram
            const formMessage = `📊 *Form Analysis*\n\n🏆 *${tournament.name}*\n🕐 *Week:* ${matchDay}\n\n⚽ *${home}* (Pos ${homePos})\nWins: ${homeForm.wins}, Draws: ${homeForm.draws}, Losses: ${homeForm.losses}\nWin Rate: ${homeForm.winRate.toFixed(2)}%\nDraw Rate: ${homeForm.drawRate.toFixed(2)}%\nImproving: ${homeForm.isImproving ? "✅ Yes" : "❌ No"}\n\n⚽ *${away}* (Pos ${awayPos})\nWins: ${awayForm.wins}, Draws: ${awayForm.draws}, Losses: ${awayForm.losses}\nWin Rate: ${awayForm.winRate.toFixed(2)}%\nDraw Rate: ${awayForm.drawRate.toFixed(2)}%\nImproving: ${awayForm.isImproving ? "✅ Yes" : "❌ No"}\n\n🔍 *Trend Pick:* ${formData.selectedPick}`;


            for (const market of oddsData.marketList) {
                if (market.name === "Over/Under") {
                    for (const detail of market.markets) {
                        for (const outcome of detail.outcomes) {
                            if (outcome.desc !== "over 1.5") continue;
                            if (outcome.odds > 1.69) continue;


                            // Send form details via Telegram
                            const msg = `🤝 *Over 1.5 Pick*\n\n🏆 *${tournament.name}*\n🕐 *Week:* ${matchDay}\n⚽ *${home} vs ${away}*\n\n💸 *Straight Over 1.5 Odds:* ${outcome.odds}\n🔢 *Draws in Form:* ${homeStanding.D}/${awayStanding.D}\n📊 *Pos:* ${homePos} vs ${awayPos}\n\n*Match Id:* ${oddsData.id}\n${formMessage}`;

                            // await sendTelegramMessage(msg);
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

    return [selections];
}

module.exports = { win_1_5 };
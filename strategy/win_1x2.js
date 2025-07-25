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

const MATCH_ANALYSIS_LOG_FILE = path.join(__dirname, "../match_analysis_log.json");

function logMatchAnalysis({
    tournament,
    matchDay,
    matchId,
    homeTeam,
    homePos,
    homeForm,
    awayTeam,
    awayPos,
    awayForm,
    selectedPick,
    correctScore = null
}) {
    const matchLog = {
        tournament,
        matchDay,
        matchId,
        homeTeam,
        homePos,
        homeForm,
        awayTeam,
        awayPos,
        awayForm,
        selectedPick,
        correctScore,
        loggedAt: new Date().toISOString()
    };

    let existingLogs = [];
    if (fs.existsSync(MATCH_ANALYSIS_LOG_FILE)) {
        try {
            const fileData = fs.readFileSync(MATCH_ANALYSIS_LOG_FILE, "utf-8");
            existingLogs = JSON.parse(fileData);
        } catch (e) {
            existingLogs = [];
        }
    }

    existingLogs.push(matchLog);
    fs.writeFileSync(MATCH_ANALYSIS_LOG_FILE, JSON.stringify(existingLogs, null, 2));
}

function updateCorrectScoreAndResult(matchData) {
    if (!fs.existsSync(MATCH_ANALYSIS_LOG_FILE)) return;

    const logs = JSON.parse(fs.readFileSync(MATCH_ANALYSIS_LOG_FILE, "utf-8"));
    const updatedLogs = logs.map(log => {
        const isSameMatch = log.matchId === matchData.id ||
            (
                log.homeTeam?.toLowerCase() === matchData.homeTeamName?.toLowerCase() &&
                log.awayTeam?.toLowerCase() === matchData.awayTeamName?.toLowerCase()
            );

        if (!isSameMatch || log.correctScore) return log;

        const homeScore = parseInt(matchData.homeScore);
        const awayScore = parseInt(matchData.awayScore);

        let selectedPick = "NO PICK";
        if (homeScore > awayScore) selectedPick = "HOME";
        else if (awayScore > homeScore) selectedPick = "AWAY";
        else selectedPick = "DRAW";

        return {
            ...log,
            correctScore: `${homeScore}-${awayScore}`,
            selectedPick
        };
    });

    fs.writeFileSync(MATCH_ANALYSIS_LOG_FILE, JSON.stringify(updatedLogs, null, 2));
}


async function autoUpdateAllFinishedMatches() {
    const logs = JSON.parse(fs.readFileSync(MATCH_ANALYSIS_LOG_FILE, "utf-8"));
    const pendingLogs = logs.filter(log => !log.correctScore && log.matchId);

    await Promise.allSettled(
        pendingLogs.map(async (log) => {
            try {
                const matchData = await getMatchOdds(log.matchId);
                if (matchData?.matchStatus === "ended") {
                    updateCorrectScoreAndResult(matchData);
                }
            } catch (err) {
                console.error(`Error updating match ${log.matchId}:`, err.message);
            }
        })
    );
}



async function checkSimilarMatchAndNotify(currentMatch) {
    if (!fs.existsSync(MATCH_ANALYSIS_LOG_FILE)) return;

    const logs = JSON.parse(fs.readFileSync(MATCH_ANALYSIS_LOG_FILE, "utf-8"));

    for (const log of logs) {
        const isSameHomeForm = currentMatch.homeForm.isImproving === log.homeForm.isImproving && currentMatch.homeForm.wins === log.homeForm?.wins &&
                               currentMatch.homeForm.draws === log.homeForm?.draws &&
                               currentMatch.homeForm.losses === log.homeForm?.losses;

        const isSameAwayForm = currentMatch.awayForm.isImproving === log.awayForm.isImproving && currentMatch.awayForm.wins === log.awayForm?.wins &&
                               currentMatch.awayForm.draws === log.awayForm?.draws &&
                               currentMatch.awayForm.losses === log.awayForm?.losses;
        // if(currentMatch.matchDay !== log.matchDay) continue;

        if (isSameHomeForm && isSameAwayForm) {
            const message = `🧠 *Similar Match Found!*

🎯 *Current Match:* ${currentMatch.homeTeam} vs ${currentMatch.awayTeam}
🟩 Home Form: W:${currentMatch.homeForm.wins} D:${currentMatch.homeForm.draws} L:${currentMatch.homeForm.losses}
🟥 Away Form: W:${currentMatch.awayForm.wins} D:${currentMatch.awayForm.draws} L:${currentMatch.awayForm.losses}

🕰 *Matched With Previous Match:*
🏆 *${log.tournament}*, Week ${log.matchDay}
⚽ *${log.homeTeam} vs ${log.awayTeam}*
✅ *Pick:* ${log.selectedPick}
📊 *Score:* ${log.correctScore || "N/A"}
🕓 *Logged:* ${log.loggedAt}
`;

            await sendTelegramMessage(message);
            break; // stop after first match found
        }
    }
}

async function win_1x2(amount = 100, matchCount = 3) {
    autoUpdateAllFinishedMatches();
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
            if (matchDay < 6) continue;

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



            // if (homeStanding.D > maxAllowedDraws || awayStanding.D > maxAllowedDraws) continue;

            const oddsData = await getMatchOdds(match.id);
            if (!oddsData?.marketList?.length) continue;

            let selectedId;


            // Analyze last 5 matches (min), up to 10 if available (if the match is less than 10 then the 5 - 2 else use 10)
            const homeForm = analyzeForm(homeStats.form, parseInt(matchDay) < 10 ? 5 : 10);
            const awayForm = analyzeForm(awayStats.form, parseInt(matchDay) < 10 ? 5 : 10);
            if (!homeForm || !awayForm) continue;

            await checkSimilarMatchAndNotify({
                homeTeam: home,
                awayTeam: away,
                homeForm,
                awayForm
            });

            if (homeForm.isImproving && awayForm.isImproving == false && homePos < awayPos) {
                selectedId = 1;
            }
            else if (awayForm.isImproving && awayForm.isImproving == false && awayPos < homePos) {
                selectedId = 3;
            }
            else {
                continue;
            }

            logMatchAnalysis({
                tournament: tournament.name,
                matchDay,
                matchId: match.id,
                homeTeam: home,
                homePos,
                homeForm,
                awayTeam: away,
                awayPos,
                awayForm,
                selectedPick: selectedId === 1 ? "HOME" : selectedId === 3 ? "AWAY" : "NO PICK",
                correctScore: null  // Optional: Predict or infer if needed
            });



            // console.log("Home Team: ", home, "\nPos: ", homePos);
            // console.log(homeForm);
            // console.log("Away Team: ", away, "\nPos: ", awayPos);
            // console.log(awayForm)
            // console.log("Pick: ", selectedId);



            for (const market of oddsData.marketList) {
                if (market.name === "1x2") {
                    for (const detail of market.markets) {
                        for (const outcome of detail.outcomes) {
                            if (parseInt(outcome.id) != selectedId) continue;
                            if (parseFloat(outcome.odds) < 1.49 ) continue;

                            // const msg = `🤝 *Straight Pick*\n\n🏆 *${tournament.name}*\n🕐 *Week:* ${matchDay}\n⚽ *${home} vs ${away}*\n\n💸 *Straight Pick Odds:* ${outcome.odds}\n🔢 *Draws in Form:* ${homeStanding.D}/${awayStanding.D}\n📊 *Pos:* ${homePos} vs ${awayPos}\n\n*Match Id:* ${oddsData.id}`;

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

    // if (selections.length === 1) {
    //     const firstPick = selections[0];
    //     if (firstPick.odds < 1.5) {
    //         selections.pop();
    //     }
    // }

    return [selections];
}

module.exports = { win_1x2 };

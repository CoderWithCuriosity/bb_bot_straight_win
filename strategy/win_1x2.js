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
        console.error("❌ Telegram Error:", err.message);
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

function getTeamStanding(standings, tournamentId, seasonId, teamName) {
    const tournament = standings.find(t => t.tournamentId === tournamentId);
    if (!tournament) return null;
    const season = tournament.seasons?.find(s => s.seasonId === seasonId);
    if (!season) return null;
    return season.standings?.find(t => t.team === teamName) || null;
}

function standingsPosition(standings, tournamentId, seasonId, teamName) {
    const tournament = standings.find(t => t.tournamentId === tournamentId);
    if (!tournament) return -1;
    const season = tournament.seasons?.find(s => s.seasonId === seasonId);
    if (!season) return -1;
    const sorted = [...season.standings].sort((a, b) => b.PTS - a.PTS);
    const pos = sorted.findIndex(t => t.team === teamName);
    return pos === -1 ? -1 : pos + 1;
}

function getTeamFormDraws(tournamentData, tournamentId, seasonId, teamName) {
    const tournament = tournamentData.find(t => t.tournamentId === tournamentId);
    if (!tournament) return 0;
    const season = tournament.seasons?.find(s => s.seasonId === seasonId);
    if (!season) return 0;
    const team = season.teams?.find(t => t.name === teamName);
    if (!team || !team.form) return 0;
    return team.form.filter(f => f === "D").length;
}

async function win_1x2(amount = 100, matchCount = 1) {
    const selections = [];
    const validMatches = await fetchMatches();
    const standings = loadSeasonStandings();
    const tournamentData = loadTournamentData();

    for (const tournament of STRATEGIC_TOURNAMENTS) {
        const [startDayStamp, daysDiff] = await fetchMatchDaysDifference(tournament.id);
        const seasonId = await fetchSeasonId(tournament.id);

        for (const match of validMatches) {
            if (match.tournamentId !== tournament.id) continue;

            const matchDay = Math.floor((match.scheduledTime - startDayStamp) / daysDiff) + 1;
            if (matchDay < 5) continue;

            const home = match.homeTeamName;
            const away = match.awayTeamName;

            const homeStanding = getTeamStanding(standings, tournament.id, seasonId, home);
            const awayStanding = getTeamStanding(standings, tournament.id, seasonId, away);
            if (!homeStanding || !awayStanding) continue;

            const homePos = standingsPosition(standings, tournament.id, seasonId, home);
            const awayPos = standingsPosition(standings, tournament.id, seasonId, away);
            if (homePos < 5 || homePos > 12 || awayPos < 5 || awayPos > 12) continue;

            const homeDraws = getTeamFormDraws(tournamentData, tournament.id, seasonId, home);
            const awayDraws = getTeamFormDraws(tournamentData, tournament.id, seasonId, away);
            // console.log("Home Draws: ", homeDraws);
            // console.log("Away Draws: ", awayDraws);
            if (homeDraws < 2 || awayDraws < 2) continue;
            let selectedId = null;
            if(homePos + 1 == awayPos || awayPos + 1 == homePos){
                selectedId = 2;
            } else {
                selectedId = homePos > awayPos ? 3 : 1;
            }

            const oddsData = await getMatchOdds(match.id);
            if (!oddsData?.marketList?.length) continue;

            for (const market of oddsData.marketList) {
                if (market.name !== "1x2") continue;

                for (const detail of market.markets) {
                    for (const outcome of detail.outcomes) {
                        if (parseInt(outcome.id) !== selectedId) continue; // Muhahaha

                        const msg = `🤝 *Draw Fake Pick*\n\n🏆 *${tournament.name}*\n🕐 *Week:* ${matchDay}\n⚽ *${home} vs ${away}*\n\n💸 *Draw Odds:* ${outcome.odds}\n🔢 *Draws in Form:* ${homeDraws}/${awayDraws}\n📊 *Pos:* ${homePos} vs ${awayPos}\n\n *Match Id: *${oddsData.id}`;
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

                        if (selections.length >= matchCount) break;
                    }
                    if (selections.length >= matchCount) break;
                }
                if (selections.length >= matchCount) break;
            }
            if (selections.length >= matchCount) break;
        }
    }

    return [selections];
}

module.exports = { win_1x2 };

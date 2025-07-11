const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { fetchMatches, getMatchOdds } = require("../api/matches");
const { fetchMatchDaysDifference, fetchSeasonId } = require("../api/fetchMatchDays");
const { updateMatchOutcomes, findMatchingOutcome, addMatchEntry } = require("../utils/matchUtils");

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
    updateMatchOutcomes();
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

            const oddsData = await getMatchOdds(match.id);
            if (!oddsData?.marketList?.length) continue;

            const teamA = {
                attack: homeStats.attack,
                defense: homeStats.defense,
                strength: homeStats.strength,
                chaos: homeStats.chaos
            };

            const teamB = {
                attack: awayStats.attack,
                defense: awayStats.defense,
                strength: awayStats.strength,
                chaos: awayStats.chaos
            };

            const result = findMatchingOutcome(teamA, teamB);
            if (result) {
                console.log("✅ Match Found:", result.outcome, result.correct_score);
                const msg = `📊 *Straight Win Pick*\n\n🏆 *Tournament:* ${tournament.name}\n🕐 *Week:* ${matchDay}\n⚽ *Match:* ${home} vs ${away}\n\n*Home Stats:*\n- Attack: ${markStat(homeStats.attack)}\n- Defense: ${markStat(homeStats.defense)}\n- Strength: ${markStat(homeStats.strength)}\n- Chaos: ${markStat(homeStats.chaos, "chaos")}\n\n*Away Stats:*\n- Attack: ${markStat(awayStats.attack)}\n- Defense: ${markStat(awayStats.defense)}\n- Strength: ${markStat(awayStats.strength)}\n- Chaos: ${markStat(awayStats.chaos, "chaos")}\n\n✅ *Pick:* ${result?.outcome}\n💸 *Correct Score:* ${result?.correct_score}\n🆔 Match ID: ${oddsData.id}`;
                await sendTelegramMessage(msg);
            } else {
                addMatchEntry(oddsData, teamA, teamB, matchDay)
                continue;
            }
            

            for (const market of oddsData.marketList) {
                if (market.name === "1x2") {
                    for (const detail of market.markets) {
                        for (const outcome of detail.outcomes) {
                            const odds = parseFloat(outcome.odds);
                            if (odds < 1.3 || odds > 3.6) continue;
                            if (parseInt(outcome.id) != 1) continue;

                            selections.push({
                                sportId: match.sportId,
                                eventId: match.id,
                                producer: match.producer,
                                marketId: market.id,
                                specifiers: "",
                                outcomeId: outcome.id,
                                amount: amount,
                                odds: odds,
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

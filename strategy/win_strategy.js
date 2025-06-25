const { computeCurrentWeekStandings } = require("../api/computeCurrentWeekStandings");
const { fetchFullTournamentData } = require("../api/fetchFullTournamentData");
const { getMatchOdds } = require("../api/matches");

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

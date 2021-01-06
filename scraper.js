const got = require("got");

module.exports = { getStreams };

const ADDON_NAME = "LookMovie.io";

const URL = "https://lookmovie.io";
const URL_FP = "https://false-promise.lookmovie.io";

// not done
async function getStreams(show_imdb, show_title, show_isMovie, show_episode, show_season, show_year) {
    try {

        // 2013-2021 => 2013
        const show_year_short = show_year.match(/\d+/);

        let streams = [];
        const slugs = await getSlugs(show_title, show_isMovie);

        console.log("slugs length: " + slugs.length);
        console.log("slugs: " + slugs);

        if (show_isMovie == true) {          // movie
            const movie_ids = await getMovieIDAsync(slugs, show_title, show_year_short);
            console.log(movie_ids);
        } else if (show_isMovie == false) {  // series
            const show_ids = await getSeriesIDAsync(slugs, show_episode, show_season, show_title, show_year_short);
            console.log(show_ids);
        } else {
            return console.error("getStreams(): show_isMovie not true or false");
        }



        return streams;
    } catch (err) {
        console.error(err);
    }
}

// done
async function getSlugs(show_title, show_isMovie) {
    try {
        console.log("show title: " + show_title);
        const show_encodedtitle = encodeURIComponent(show_title);
        const showType = getShowType(show_isMovie);
        const searchURL = `${URL}/api/v1/${showType}/search/?q=${show_encodedtitle}`;

        console.log(searchURL);
        const search_results = await got(searchURL);

        let search_parsedresults = JSON.parse(search_results.body);
        console.log("JSON.parsed search results: " + JSON.stringify(search_parsedresults, null, 4));

        // get part with data about results from json
        let results = search_parsedresults["result"];

        // go through all results and push slug to slugs[] from each
        let slugs = [];
        results.forEach(result => {
            const slug = result["slug"];
            console.log("pushing slug to slugs array: " + slug);
            slugs.push(slug);
        });

        return slugs;


    } catch (err) {
        console.error("Failed getSlugs() for show_title: " + show_title);
        console.error(err);
        return [];
    }
}


// done
// show_title and year are only used to check if shows from lookmovie search is actually same show user selected from stremio
async function getMovieIDAsync(slugs, show_title, show_year) {

    let movies = [];

    const slugs_res_bodies = await getHTMLBodiesFromSlugs(slugs, true);

    console.log("length of slugs_responses: " + slugs_res_bodies.length);

    for (const body of slugs_res_bodies) {
        try {

            let movie = {};

            // same for all shows
            movie["slug"] = body.match(/\/movies\/view\/([^"]+)/)[1];
            movie["title"] = body.match(/title: '((?:\\'|[^'])+)'/)[1].replace("\\", "");
            movie["year"] = body.match(/year: '(\d+)'/)[1];

            // only for movies
            movie["movie_id"] = body.match(/id_movie: (\d+)/)[1];


            movie["match"] = checkShowMatch(movie, show_title, show_year);
            if (movie["match"]) {
                // console.warn(movie["title"] + movie["year"] + ", matches: " + movie_title + movie_year);
                return movie;
            } else {
                // console.warn(movie["title"] + movie["year"] + ", not match: " + movie_title + movie_year);
                movies.push(movie);
            }

        } catch (err) {
            console.error(err);
            console.warn("Didn't find movie");
        }
    }
    return movies;
}

// done
async function getSeriesIDAsync(slugs, show_episode, show_season, show_title, show_year) {

    let shows = [];

    const slugs_res_bodies = await getHTMLBodiesFromSlugs(slugs, false);

    console.log("length of slugs_responses: " + slugs_res_bodies.length);

    for (const body of slugs_res_bodies) {
        try {

            let show = {};

            // same for all shows
            show["slug"] = body.match(/slug: '([^']+)'/)[1];
            show["title"] = body.match(/title: '((?:\\'|[^'])+)'/)[1].replace("\\", "");
            show["year"] = body.match(/year: '(\d+)'/)[1];

            // only for series
            const EPISODE_DATA_REGEX = new RegExp(
                `title: '((?:\\\\'|[^'])+)', episode: '${show_episode}', id_episode: (\\d+), season: '${show_season}'`
            );
            show["episode_id"] = body.match(EPISODE_DATA_REGEX)[2];
            show["episode_title"] = body.match(EPISODE_DATA_REGEX)[1].replace("\\", "");
            show["series_id"] = body.match(/id_show: (\d+)/)[1];


            show["match"] = checkShowMatch(show, show_title, show_year);
            if (show["match"]) {
                return show;
            } else {
                shows.push(show);
            }

        } catch (err) {
            console.error(err);
            console.warn("Didn't find episode " + show_episode + " of season " + show_season + " of some show");
        }
    }
    return shows;
}

async function requestAsync(url) {
    const response = await got(url);
    return new Promise((resolve, reject) => {
        try {
            resolve(response.body);
        } catch (error) {
            return reject(error);
        }
    });
}

async function gotAsync(URLs) {
    let data;
    try {
        data = await Promise.all(URLs.map(requestAsync));
    } catch (err) {
        console.error(err);
    }
    return data;
}

function checkShowMatch(show, show_title, show_year) {
    const match = show["title"] == show_title && show["year"] == show_year;
    console.warn(show["title"] + show["year"] + ", match check: " + show_title + show_year);
    console.warn(match);
    return match;
}

async function getHTMLBodiesFromSlugs(slugs, show_isMovie) {
    const showType = getShowType(show_isMovie);
    const slugs_urls = slugs.map(slug => `${URL}/${showType}/view/${slug}`);
    const slugs_res_bodies = await gotAsync(slugs_urls);
    return slugs_res_bodies;
}

function getShowType(show_isMovie) {
    const showType = show_isMovie ? "movies" : "shows";
    return showType;
}
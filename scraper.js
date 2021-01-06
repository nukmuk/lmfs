const got = require("got");

module.exports = { getStremioStreams: getStremioStreams };

const ADDON_NAME = "LookMovie.io";

const URL_BASE = "https://lookmovie.io";
const URL_FP_BASE = "https://false-promise.lookmovie.io";

// not done
async function getStremioStreams(show_imdb, show_title, show_isMovie, show_episode, show_season, show_year) {
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
            const movie_streams = await getStreams(movie_ids);
            console.log(movie_streams);
            return movie_streams;
        } else if (show_isMovie == false) {  // series
            const series_ids = await getSeriesIDAsync(slugs, show_episode, show_season, show_title, show_year_short);
            console.log(series_ids);
            const series_streams = await getStreams(series_ids);
            console.log(series_streams);
            return series_streams;
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
        console.warn("isMovie: " + show_isMovie);
        const showType = getShowType(show_isMovie);
        const searchURL = `${URL_BASE}/api/v1/${showType}/search/?q=${show_encodedtitle}`;

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
            movie["isMovie"] = true;
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
            show["isMovie"] = "false";
            show.episode = show_episode;
            show.season = show_season;
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

// not done
// input show object from getID functions
async function getStreams(show) {
    try {
        console.log(JSON.stringify(show, null, 4));
        console.warn("isMovie: " + show.isMovie);
        const showType = getShowType(show.isMovie);

        let showID, showID_type;

        if (show.isMovie == true) {
            console.log("ISMOVIE TRUE");
            showID = show["movie_id"];
            showID_type = "id_movie";
        } else {
            showID = show["slug"];
            showID_type = "slug";
        }

        console.log(showID);

        const dataURL = `${URL_FP_BASE}/api/v1/storage/${showType}?${showID_type}=${showID}`;
        console.warn("dataurl: " + dataURL);

        const res = await got(dataURL);
        const body = JSON.parse(res.body);
        const data = body["data"];
        const expires = data["expires"];
        const accessToken = data["accessToken"];

        console.log(data);

        const URL_STREAM_BASE = `${URL_BASE}/manifests/${showType}/json`;

        // build streamURL
        let streamURL;
        if (show["isMovie"] == true) {
            streamURL = `${URL_STREAM_BASE}/${show.movie_id}/${expires}/${accessToken}/master.m3u8`;
        } else {
            streamURL = `${URL_STREAM_BASE}/${accessToken}/${expires}/${show.episode_id}/master.m3u8`;
        }
        console.warn("streamURL: " + streamURL);

        // get qualities from streamURL
        const streams_res = await got(streamURL);
        const streams_parsed = JSON.parse(streams_res.body);
        console.warn(JSON.stringify(streams_parsed, null, 4));

        // loop through qualities and return streams
        const qualities = [720, 480, 360];
        let streams = [];
        for (const s in streams_parsed) {
            console.log("s: " + s);
            if (!streams_parsed[s].endsWith("index.m3u8")) {
                console.log("skipping quality: " + s);
                continue;
            } else {
                const q = s.match(/\d+/); // 720
                const qp = q + "p";       // 720p

                let stream = {};

                const matchEmoji = show.match ? "✔️" : "❌";
                stream.title = `${matchEmoji}${show.title} ${show.year}\n${show.episode_title}`;
                stream.url = streams_parsed[s];

                stream.name = `${ADDON_NAME} ${qp}`;

                stream.behaviorHints = {};
                stream.behaviorHints.bingeGroup = `lookmovie-${q}-${show.slug}`;
                streams.push(stream);

            }
        }
        /*
                for (const q of qualities) {
                    const qp = q + "p";
                    console.warn("result: " + Object.keys(streams_parsed));
        
                    let stream = {};
                    stream["name"] = `${ADDON_NAME} ${qp}`;
                    stream["url"] = streams_parsed[qp];
                    stream.title = show.slug;
        
        
                    streams.push = stream;
        
                    console.log("stream: " + stream);
                }
        */

        console.log("streams: " + streams);
        return streams;


    } catch (err) {
        console.error(err);
    }
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

    console.warn("isMovie: " + show_isMovie);

    const showType = getShowType(show_isMovie);
    const slugs_urls = slugs.map(slug => `${URL_BASE}/${showType}/view/${slug}`);
    const slugs_res_bodies = await gotAsync(slugs_urls);
    return slugs_res_bodies;
}

function getShowType(isMovie) {
    console.log("getshowtype: " + isMovie);
    if (isMovie == true) {
        return "movies";
    } else if (isMovie == undefined) {
        return console.error("getShowType(): isMovie not true/false, was: " + isMovie);
    } else {
        return "shows";
    }
}
const { error } = require("console");
const got = require("got");
const URL = require("url");
const proxy = require("./proxy.js");
const publicIp = require("public-ip");

module.exports = { getSources };

const ADDON_NAME = "LookMovie.io";

const URL_BASE = "https://lookmovie.io";
const URL_FP_BASE = "https://false-promise.lookmovie.io";

const REGEX_DIGITSEQ = new RegExp(/\d+/);
const REGEX_SUBS_FILES = new RegExp(/"file":.*"(\/[^"]+)"/g);
const REGEX_SUBS_LABELS = new RegExp(/"label": "([^"]+)"/g);
const REGEX_SUBS_BOTH = new RegExp(/"file":.*"(\/[^"]+)"|"label": "([^"]+)"/g);

const PREFIX_SUBS = "💬";
const PREFIX_MATCH_TRUE = ""; // ✔️
const PREFIX_MATCH_FALSE = "❌";
const SUFFIX_WARNING = "⚠️";
// eslint-disable-next-line no-irregular-whitespace
const PREFIX_EPISODEINFO = ""; // " >" U+2001 instead of space

const USE_ALTERNATE_SUBS_LANG = true; // display subs from lookmovie separately from other sources

const PORT = 25565;
let EXTERNAL_IP;

(async () => {
    EXTERNAL_IP = await publicIp.v4();
    console.log("external ip:", EXTERNAL_IP);
})();


// done
async function getSources(show_imdb, show_title, show_isMovie, show_episode, show_season, show_year) {
    try {

        // 2013-2021 => 2013
        const show_year_short = show_year.match(/\d+/);

        const slugs = await getSlugs(show_title, show_isMovie);

        if (show_isMovie == true) {          // movie
            const movie_ids = await getMovieIDAsync(slugs, show_title, show_year_short);
            const movie_stremiostreams = await getStreamsFromMultipleShows(movie_ids);
            return movie_stremiostreams;
        } else if (show_isMovie == false) {  // series
            const series_ids = await getEpisodeIDAsync(slugs, show_episode, show_season, show_title, show_year_short);
            const series_stremiostreams = await getStreamsFromMultipleShows(series_ids);
            return series_stremiostreams;
        } else {
            return console.error("getStreams(): show_isMovie not true or false");
        }
    } catch (err) {
        console.error(err);
        throw ("getSources(): " + err);
    }
}



// gets slugs from searching show titles on lookmovie
async function getSlugs(show_title, show_isMovie) {
    try {
        const show_encodedtitle = encodeURIComponent(show_title);
        const showType = getShowType(show_isMovie);
        const searchURL = `${URL_BASE}/api/v1/${showType}/search/?q=${show_encodedtitle}`;

        const search_results = await got(searchURL);

        let search_parsedresults = JSON.parse(search_results.body);

        // get part with data about results from json
        let results = search_parsedresults["result"];

        // go through all results and push slug to slugs[] from each
        let slugs = [];
        results.forEach(result => {
            const slug = result["slug"];
            slugs.push(slug);
        });


        if (slugs.length == 0) {
            throw ("getSlugs(): No slugs found for: " + show_title);
        }

        return slugs;


    } catch (err) {
        console.error(err);
        throw (err);
        // return [];
    }
}


// done
// show_title and year are only used to check if shows from lookmovie search is actually same show user selected from stremio
async function getMovieIDAsync(slugs, show_title, show_year) {

    let movies = [];

    const slugs_res_bodies = await getHTMLBodiesFromSlugs(slugs, true);

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


            // movie subtitles

            const subtitles = getMovieSubs(body);

            movie.subtitles = subtitles;

            // check if requested name and year match the name and year from lookmovie
            movie["match"] = checkShowMatch(movie, show_title, show_year);
            if (movie["match"]) {
                return movie;
            } else {
                movies.push(movie);
            }



        } catch (err) {
            throw ("getMovieIDAsync(): Didn't find movie");
        }
    }

    return movies;
}

// done
async function getEpisodeIDAsync(slugs, show_episode, show_season, show_title, show_year) {

    let shows = [];

    const slugs_res_bodies = await getHTMLBodiesFromSlugs(slugs, false);

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


            // subtitles

            show.subtitles = await getEpisodeSubs(show.episode_id);

            show["match"] = checkShowMatch(show, show_title, show_year);
            if (show["match"]) {
                return show;
            } else {
                shows.push(show);
            }

        } catch (err) {
            console.error(err);
            throw ("getEpisodeIDAsync(): Didn't find episode: " + show_episode + " of season: " + show_season + " of some show");

        }
    }
    return shows;
}

// done
// input show object from getID functions
async function getStreams(show) {
    try {
        console.log(show);
        const showType = getShowType(show.isMovie);


        // define show identifier and type (movie_id or slug)
        let showID, showID_type;
        if (show.isMovie == true) {
            showID = show["movie_id"];
            showID_type = "id_movie";
        } else {
            showID = show["slug"];
            showID_type = "slug";
        }

        // request expiration and accessToken
        const dataURL = `${URL_FP_BASE}/api/v1/storage/${showType}?${showID_type}=${showID}`;
        const res = await got(dataURL);
        const body = JSON.parse(res.body);
        const data = body["data"];
        const expires = data["expires"];
        const accessToken = data["accessToken"];

        const URL_STREAM_BASE = `${URL_BASE}/manifests/${showType}/json`;

        // build streamsURL
        let streamsURL;
        if (show["isMovie"] == true) {
            streamsURL = `${URL_STREAM_BASE}/${show.movie_id}/${expires}/${accessToken}/master.m3u8`;
        } else {
            streamsURL = `${URL_STREAM_BASE}/${accessToken}/${expires}/${show.episode_id}/master.m3u8`;
        }

        // get qualities from streamsURL
        const streams_res = await got(streamsURL);
        const streams_parsed = JSON.parse(streams_res.body);

        console.warn(JSON.stringify(streams_parsed, null, 4));

        // loop through qualities and return streams
        let streams = [];
        let proxyCreated = false;
        for (const s in streams_parsed) {
            // skip auto and dummy stuff
            if (!streams_parsed[s].endsWith("index.m3u8")) {
                continue;
            } else {
                addStreamToArray(s, show, streams_parsed[s], streams);

                if (!proxyCreated) {
                    proxy.createProxy(streams_parsed[s]);
                    proxyCreated = true;
                }
            }
        }


        // try to get 1080p stream
        try {
            // regex replaces quality (e.g. 480, 720) with 1080
            const fhd_url = streams[0].url.replace(/(.*\/)(\d{3})(p?\/.*)/, "$11080$3");
            console.warn("fhd_url: " + fhd_url);
            const fhd_res = await got(fhd_url);
            const fhd_status = fhd_res.statusCode;
            if (fhd_status == 200) {
                addStreamToArray("1080", show, fhd_url, streams);
            }
        } catch (err) {
            console.log("No 1080p stream found for:", show.title);
        }

        return streams;


    } catch (err) {
        throw ("getStreams(): " + err);
    }
}

async function getStreamsFromMultipleShows(shows) {
    const l = shows.length;

    let allStreams = [];

    // if more than 1 shows get streams asynchronously
    if (l > 1) {
        const promises = shows.map(getStreams);
        const streams = await Promise.all(promises);
        allStreams.push(streams);
    } else if (l === 1) {
        const streams = await getStreams(shows[0]);
        allStreams.push(streams);
    } else {
        const streams = await getStreams(shows);
        allStreams.push(streams);
    }
    allStreams = allStreams.flat(2);

    // sort streams so highest quality is first
    allStreams.sort((a, b) => (parseInt(a.name.match(REGEX_DIGITSEQ)) < parseInt(b.name.match(REGEX_DIGITSEQ))) ? 1 : -1);

    return allStreams;
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
    return match;
}

async function getHTMLBodiesFromSlugs(slugs, show_isMovie) {

    const showType = getShowType(show_isMovie);
    const slugs_urls = slugs.map(slug => `${URL_BASE}/${showType}/view/${slug}`);
    const slugs_res_bodies = await gotAsync(slugs_urls);
    return slugs_res_bodies;
}

function getShowType(isMovie) {
    if (isMovie == true) {
        return "movies";
    } else if (isMovie == undefined) {
        throw ("getShowType(): isMovie not true/false, was: " + isMovie);
    } else {
        return "shows";
    }
}

// https://google.com => http://127.0.0.1/google.com
function convertUrlHostToProxyIp(url) {
    const UrlObj = URL.parse(url);
    const ip_and_port = EXTERNAL_IP + ":" + PORT;
    if (!url.includes(ip_and_port)) {
        url = "http://" + ip_and_port + "/" + UrlObj.host + UrlObj.path;
    }
    return url;
}

function addStreamToArray(quality_key_string, show, streamURL, arrayToAddTo) {
    try {

        // PROXY

        streamURL = convertUrlHostToProxyIp(streamURL);

        // STREAM

        const q = quality_key_string.match(/\d+/);  // 720
        const qp = q + "p";                         // 720p   
        const stream_quality = q ? qp : quality_key_string;


        let stream = {};

        const matchEmoji = show.match ? PREFIX_MATCH_TRUE : PREFIX_MATCH_FALSE;
        let episodeInfo = "";

        if (show.isMovie == "false") {
            episodeInfo += `\n${PREFIX_EPISODEINFO} S${show.season}E${show.episode}: ${show.episode_title}`;
        }

        const subtitles = show.subtitles;

        stream.title = `${matchEmoji} ${show.title} (${show.year})${episodeInfo}\n${PREFIX_SUBS} ${subtitles.length}`;
        stream.url = streamURL;

        stream.name = `${ADDON_NAME} ${stream_quality}`;

        if (show.match == false) {
            stream.name += ` ${SUFFIX_WARNING}`;
        }

        if (subtitles.length > 0) {
            stream.subtitles = subtitles;
        }

        stream.behaviorHints = {};
        stream.behaviorHints.bingeGroup = `lookmovie-${q}-${show.slug}`;
        stream.behaviorHints.notWebReady = "true";
        arrayToAddTo.push(stream);
    } catch (err) {
        console.error(err);
    }
}

// get array of subtitles objects from lookmovie html body
function getMovieSubs(body) {

    let subtitles = [];

    const subs_files = [...body.matchAll(REGEX_SUBS_FILES)];
    const subs_labels = [...body.matchAll(REGEX_SUBS_LABELS)];

    // console.log("labels: " + subs_labels[1]);

    for (const [i, v] of subs_files.entries()) {
        const file = v[1];
        const label = subs_labels[i][1];

        const url = `${URL_BASE}${file}`;
        const lang = USE_ALTERNATE_SUBS_LANG ? `${PREFIX_SUBS} ${label}` : label.toLowerCase().slice(0, 3);

        let sub = {};
        sub.url = url;
        sub.lang = lang;
        subtitles.push(sub);
    }
    return subtitles;
}

async function getEpisodeSubs(episode_id) {
    try {

        const subslist_url = `${URL_BASE}/api/v1/shows/episode-subtitles/?id_episode=${episode_id}`;
        const subslist_res = await got(subslist_url);
        const subslist_json = JSON.parse(subslist_res.body);

        let subtitles = [];

        for (const s of subslist_json) {
            console.warn(s);
            const languageName = s.languageName;
            const shard = s.shard;
            const isoCode = s.isoCode;
            const storagePath = s.storagePath;

            let sub = {};

            const url = `${URL_BASE}/${shard}/${storagePath}${isoCode}.vtt`;
            const lang = USE_ALTERNATE_SUBS_LANG ? `${PREFIX_SUBS} ${languageName}` : languageName.toLowerCase().slice(0, 3);

            sub.url = url;
            sub.lang = lang;
            subtitles.push(sub);
        }
        console.log(subtitles);
        return subtitles;
    } catch (err) {
        console.warn("Failed getting subs for:", episode_id);
    }
}
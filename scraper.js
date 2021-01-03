const got = require("got");

module.exports = { getStreams };

const ADDON_NAME = "LookMovie.io";

const URL = "https://lookmovie.io";
const URL_FP = "https://false-promise.lookmovie.io";

// not done
async function getStreams(show_imdb, show_name, show_isMovie, show_episode, show_season) {
    try {

        let streams = [];
        const slugs = await getSlugs(show_name, show_isMovie);

        console.log("slugs length: " + slugs.length);
        console.log("slugs: " + slugs);

        if (show_isMovie == true) {          // movie
            const movie_ids = await getMovieID(slugs);
            console.log(movie_ids);
        } else if (show_isMovie == false) {  // series
            const show_ids = await getSeriesIDAsync(slugs, show_episode, show_season);
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
async function getSlugs(show_name, show_isMovie) {
    try {
        console.log("show name: " + show_name);
        const show_encodedname = encodeURIComponent(show_name);

        let searchURL;

        if (show_isMovie == true) {
            searchURL = `${URL}/api/v1/movies/search/?q=${show_encodedname}`;
        } else if (show_isMovie == false) {
            searchURL = `${URL}/api/v1/shows/search/?q=${show_encodedname}`;
        } else {
            console.error("show_isMovie not true or false");
            return [];
        }

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
        console.error("Failed getSlugs() for show_name: " + show_name);
        console.error(err);
        return [];
    }
}


// done
async function getMovieID(slugs) {

    let movies = [];

    for (const slug of slugs) {
        try {

            let movie = {};
            movie["slug"] = slug;

            console.log("trying movie slug: " + slug);

            let URL_SLUG_MOVIES = `${URL}/movies/view/${slug}`;

            const html = await got(URL_SLUG_MOVIES);
            const html_body = html.body;

            // same for movies and shows
            movie["title"] = html.body.match(/title: '([^']+)'/)[1];
            movie["year"] = html.body.match(/year: '(\d+)'/)[1];

            // only for movies
            movie["movie_id"] = html_body.match(/id_movie: (\d+)/)[1];

            movies.push(movie);

        } catch (err) {
            console.error(err);
            console.warn("Didn't find movie: " + slug);
        }
    }
    return movies;
}

// done
async function getSeriesIDAsync(slugs, show_episode, show_season) {

    let shows = [];

    const slugsURLs = slugs.map(x => `${URL}/shows/view/${x}`);

    const slugs_html = await getParallel(slugsURLs);

    console.log("length of slugs_html: " + slugs_html.length);

    for (const html of slugs_html) {
        try {

            let show = {};

            console.log(html);
            const EPISODE_DATA_REGEX = new RegExp(
                `title: '([^']+)', episode: '${show_episode}', id_episode: (\\d+), season: '${show_season}'`
            );


            // same for movies and series
            show["slug"] = html.match(/slug: '([^']+)'/)[1];
            show["title"] = html.match(/title: '([^']+)'/)[1];
            show["year"] = html.match(/year: '(\d+)'/)[1];

            // only for series
            show["episode_title"] = html.match(EPISODE_DATA_REGEX)[1];
            show["episode_id"] = html.match(EPISODE_DATA_REGEX)[2];
            show["show_id"] = html.match(/id_show: (\d+)/)[1];

            shows.push(show);

        } catch (err) {
            console.error(err);
            console.warn("Didn't find episode " + show_episode + " of season " + show_season + " of some show");
        }
    }
    return shows;
}

// sends http requests in parallel. returns array of got html response object things
async function convertSlugsToHTML(slugs) {

    const slugsURLs = slugs.map(x => `${URL}/shows/view/${x}`);

    console.warn(slugsURLs);

    const promises = slugsURLs.map(got);
    let result = [];
    result = await Promise.allSettled(promises);
    console.log("ASDAJDKSSAKLJDAHSKJDSJKDHASKJDHASD");
    console.warn(result);
    return result;

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

async function getParallel(slugs) {
    try {
        var data = await Promise.all(slugs.map(requestAsync));
    } catch (err) {
        console.error("ERROR: " + err);
    }
    return data;
}
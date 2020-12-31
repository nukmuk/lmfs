const got = require("got");

module.exports = { getStreams };

const addon_name = "LookMovie.io";

const URL = "https://lookmovie.io";
const URL_FP = "https://false-promise.lookmovie.io";

// not done
async function getStreams(show_imdb, show_name, show_isMovie, show_episode, show_season) {
    try {

        let streams = [];

        const slugs = await getSlugs(show_name, show_isMovie);

        if (show_isMovie == true) {
            // todo
        } else if (show_isMovie == false) {
            // todo
        } else {
            return console.error("show_isMovie not true or false");
        }
        console.log("slugs amount: " + slugs.length);


        return streams;
    } catch (err) {
        console.error(err);
    }
}

// done (maybe. made at klo 7 in the morning)
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
        console.error(err);
        return [];
    }
}


// not done
async function getMovieID(slugs) {

}

// not done
async function getSeriesID(slugs) {
    for (const slug of slugs) {
        try {
            console.log("trying slug: " + slug);
            const show_id = await getShowID(show_slug)
            console.log("show_id: " + show_id);


        } catch (err) {
            console.error(err);
            console.log("Didn't find show: " + slug);
        }
    }
}
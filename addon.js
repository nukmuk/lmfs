const { addonBuilder, serveHTTP, publishToCentral } = require("stremio-addon-sdk");
const got = require("got");
const scraper = require("./scraper.js");

const builder = new addonBuilder({
    id: "com.stremio.lookmovie.addon",
    version: "0.0.2",
    name: "LookMovie for Stremio",
    description: "Watch movies and shows hosted on LookMovie.io",
    icon: "https://lookmovie.io/android-icon-192x192.png",
    background: "https://i.imgur.com/x7bcxUY.png",

    // Properties that determine when Stremio picks this addon
    catalogs: [],
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"]
});

// takes function(args)
builder.defineStreamHandler(async function (args) {

    let streams;

    try {

        // get imdb number from args.id using regex
        // args.id format: tt0123456:season:episode
        const show_imdb = args.id.match(/tt\d+/);

        const show_meta = await getShowMetadata(show_imdb, args.type);
        const show_name = show_meta["name"];
        const show_year = show_meta["year"];

        // get streams
        if (args.type == "movie") {          // for movies
            streams = await scraper.getSources(show_imdb, show_name, true, null, null, show_year);

        } else if (args.type == "series") {  // for series
            // get season and episode number from args.id using regex
            const show_season = args.id.match(/tt.+:(.+):.+/)[1];
            const show_episode = args.id.match(/tt.+:.+:(.+)/)[1];

            streams = await scraper.getSources(show_imdb, show_name, false, show_episode, show_season, show_year);
        }
    } catch (err) {
        console.error(err);
        throw ("Failed");
    }
    console.warn("STREAMS FINAL:", streams);
    return Promise.resolve({ streams: streams });
});


serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
//publishToCentral("https://your-domain/manifest.json") // <- invoke this if you want to publish your addon and it's accessible publically on "your-domain"


// input imdb: tt0123456
async function getShowMetadata(show_imdb, show_type) {
    try {
        const cinemeta_url = `https://v3-cinemeta.strem.io/meta/${show_type}/${show_imdb}.json`;
        const cinemeta_res = await got(cinemeta_url);
        const cinemeta_json = JSON.parse(cinemeta_res.body);
        const show_meta = cinemeta_json["meta"];
        return show_meta;
    } catch (err) {
        throw ("Didn't get metadata from cinemeta");
    }
}
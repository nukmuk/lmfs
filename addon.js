const { addonBuilder, serveHTTP, publishToCentral } = require("stremio-addon-sdk");
const got = require("got");
const scraper = require("./scraper.js");

const builder = new addonBuilder({
    id: "com.stremio.lookmovie.addon",
    version: "0.0.1",
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
    try {

        const show_imdb = args.id.match(/tt\d+/);
        const show_type = args.type;
        console.log(show_type);

        // get name of the show from cinemeta
        const cinemeta_url = `https://v3-cinemeta.strem.io/meta/${show_type}/${show_imdb}.json`;
        console.log("cinemeta url: " + cinemeta_url);
        const cinemeta_html = await got(cinemeta_url);
        const cinemeta_json = JSON.parse(cinemeta_html.body);
        const show_name = cinemeta_json["meta"]["name"];
        console.log("show name from cinemeta: " + show_name);

        if (args.type == "movie") {
            console.log("show is movie");
            // getStreams(show_imdb, show_name, true);
        } else if (args.type == "series") {
            console.log("show is series");
            // getStreams(show_imdb, show_name, false, show_episode, show_season);
        }
    } catch (err) {
        console.error(err);
    }
    return Promise.resolve({ streams: streams });
});


serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
//publishToCentral("https://your-domain/manifest.json") // <- invoke this if you want to publish your addon and it's accessible publically on "your-domain"

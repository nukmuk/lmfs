const express = require("express");
const morgan = require("morgan");
const { createProxyMiddleware } = require("http-proxy-middleware");
const URL = require("url");

module.exports = { createProxy };

// config
const PORT = process.env.PORT2 || 8000;
const HOST = "0.0.0.0";

// create express server
const app = express();

// logging
app.use(morgan("tiny"));

// info get endpoint
app.get("/info", (req, res) => {
    res.send("Proxy server for lookmovie");
});

// test
createProxy("https://jsonplaceholder.typicode.com");

app.listen(PORT, HOST, () => {
    console.log(`Starting proxy at ${HOST}:${PORT}`);
});

// creates proxy from url
function createProxy(input) {
    try {
        console.log("PROXY INPUT:", input);
        const host = URL.parse(input).host;
        console.log("CREATING PROXY FROM HOST:", host);
        app.use(`/${host}`, createProxyMiddleware({
            target: `http://${host}`,
            changeOrigin: true,
            pathRewrite: {
                [`^/${host}`]: "",
            },
        }));
    } catch (err) {
        console.error(err);
        throw ("Failed creating proxy: " + err);
    }
}
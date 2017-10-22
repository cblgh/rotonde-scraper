var forever = require("forever-monitor")
var scraper = require("./index.js")
var mv = require("mv")
var path = require("path")

var DAT_PATH = "/home/cblgh/dats/rotonde-scraped"
var SCRAPE_DEADLINE = 20 * 60 * 1000 // minutes
var child

function startScraping() {
    console.log("start scraping")
    child = new (forever.Monitor)("index.js")
    child.start()
}

function finishScraping() {
    console.log("stop scraper")
    if (child) {
        child.stop()
    }
}

function moveFiles() {
    console.log("moving files")
    return new Promise((resolve, reject) => {
        mv(scraper.dataPath, path.resolve(DAT_PATH, scraper.dataPath), {mkdirp: true}, function(err) {
            if (err) { return reject(err) }
            mv(scraper.networkPath,  path.resolve(DAT_PATH, scraper.networkPath), {mkdirp: true}, function(err) {
                if (err) { return reject(err) }
                resolve()
            })
        })
    })
}

setInterval(() => {
    console.log("stop the scraping process")
    finishScraping()
    child.on("stop", () => {
        moveFiles()
        .then(startScraping)
        .catch((e) => {
            console.error("Error when finished scraping", e)
        })
    })
}, SCRAPE_DEADLINE)

startScraping()

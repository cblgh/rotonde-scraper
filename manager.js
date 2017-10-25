var forever = require("forever-monitor")
var scraper = require("./index.js")
var mv = require("mv")
var path = require("path")
var exec = require("child_process").exec

var DAT_PATH = "/home/cblgh/dats/rotonde-scraped"
var SCRAPE_DEADLINE = 20 * 60 * 1000 // minutes
SCRAPE_DEADLINE = 10000 // set deadline to 10 seconds for testing
var child

function start() {
    console.log("start scraping")
    child = new (forever.Monitor)("index.js")
    child.start()
}

function finish() {
    console.log("stop scraper")
    if (child) {
        child.stop()
    }
}

function sort(filename) {
    console.log(`sort ${filename}`)
    return new Promise((resolve, reject) => {
        var proc = exec(`cat ${filename} | jq -s . | jq "sort_by(.timestamp)" | jq ".[]" --compact-output > ./sorted.txt`, (err, stdout, stderr) => {
            if (err) {
                console.error(`failed to sort ${filename}`)
                return reject(err)
            }
            mv("./sorted.txt", filename, function(err) {
                if (err) { 
                    console.error("failed to rename sorted.txt")
                    return reject(err)
                }
                return resolve()
            })
        })
    })
}

function move() {
    console.log("moving files")
    var paths = [scraper.dataPath, scraper.networkPath, scraper.metadataPath]
    var mvPromises = paths.map((f) => {
        return new Promise((resolve, reject) => {
            console.log(`moving ${f}`)
            mv(f, path.resolve(DAT_PATH, f), {mkdirp: true}, function(err) {
                if (err) { return reject(err) }
                resolve()
            })
        })
    })
    return Promise.all(mvPromises)
}

setInterval(() => {
    console.log("stop the scraping process")
    finish()
    child.on("stop", () => {
        sort(scraper.dataPath)
        .then(move)
        .then(start)
        .catch((e) => {
            console.error("Error occurred when wrapping up", e)
        })
    })
}, SCRAPE_DEADLINE)

start()

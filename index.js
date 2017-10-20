var Dat = require("dat-node")
var fs = require("fs")

var queue = []
var knownUsers = {}
var loadedUsers = {}
var userCount = 0
var fetching = 0

var scrapedUsers = [] // mirrors loadedUsers, but used for saving to file (attempted hack for fixing segfaults)
var datUrl = "dat://7f2ef715c36b6cd226102192ba220c73384c32e4beb49601fb3f5bba4719e0c5/"
var DEADLINE = 10 * 60
var start = new Date()

/* KNOWN ERRORS:
 * node: src/unix/udp.c:67: uv__udp_finish_close: Assertion
 * `!uv__io_active(&handle->io_watcher, POLLIN | POLLOUT)' failed.
 *
 * CAUSE: something in dat-node that fails when closing utp connections
 *
 * random ass segfaults
 * CAUSE: cblgh?
*/

function compare(a, b) {
    if (parseInt(a["timestamp"]) < parseInt(b["timestamp"])) {
        return -1;
    }
    if (parseInt(a["timestamp"]) > parseInt(b["timestamp"])) {
        return 1;
    }
    return 0;
}

function DatArchive(url) {
    var self = this
    this.url = url

    this.readFile = function(path) {
        return new Promise(function (resolve, reject) {
            Dat("./files", {key: self.url, temp: true, sparse: true}, function(err, dat) {
                self.dat = dat
                if (err) reject(err)
                dat.archive.readFile(path, function(err, data) {
                    if (err) reject(err)
                    if (data) { resolve(data.toString())} else { resolve() }
                })
                var network = dat.joinNetwork()
            })
        })
    }

    this.close = function() {
        if (this.dat) {
            this.dat.close(function() { console.log("closed!") })
        }
    }
}

function addUser(portal) {
	if(loadedUsers.indexOf(portal.dat) >= 0) { --fetching; return; }
	loadedUsers.push(portal.dat)
	
	++userCount
	--fetching
}

function cleanURL(url) {
	url = url.trim()
	while(url[url.length-1] == "/") {
		url = url.slice(0, -1)
	}
	return url + "/"
}

var writeQueue = []
async function loadSite(url) {
	if(loadedUsers.indexOf(url) >= 0) return
    let archive = new DatArchive(url)
	try {
		++fetching
		let data = await archive.readFile("/portal.json")
		let portal = JSON.parse(data)
        archive.close()
		addUser(portal)

        if (portal.feed) {
            writeQueue.push(portal.feed)
        }
        if (portal.dat) {
            scrapedUsers.push(portal.dat)
        }

        // crawl the list of portals
		for(let i=0; i<portal.port.length; ++i) {
			let p = cleanURL(portal.port[i])
			if(!knownUsers[p]) {
				knownUsers[p] = true
				queue.push(p)
			}
		}
	} catch(err) {
		console.log(err)
		--fetching
        archive.close()
	}
}

function tick() {
    var timeElapsed = parseInt((new Date() - start) / 1000)
    console.log(process.memoryUsage())
	if(queue.length > 0 || timeElapsed < DEADLINE) {
		let url = queue.shift()
		loadSite(url)
        setTimeout(tick, 250)
	} else {
        console.log("finished!")
        process.exit()
    }
}

function writer() {
    if (writeQueue.length > 0) {
        console.log("writequeue length", writeQueue.length)
        var arr = writeQueue.shift()
        var data = arr.map((item) => { return JSON.stringify(item) }).join("\n")
        fs.appendFile("./scraped.txt", data, function(err) {
            writer()
        })
    } else {
        setTimeout(writer, 1500)
    }
}

// save scraped portals to mitigate intermittent crash with dat-node
// when closing utp connections (i.e. we can pickup where we left off)
function saveScrapedPortals() {
    var data = JSON.stringify(scrapedUsers)
    fs.writeFile("./scrapedPortals.json", data, function(err) {
        if (err) { throw err }
        setTimeout(saveScrapedPortals, 1000)
    })
}

async function main() {
    // clear scraped file
    // fs.writeFile("./scraped.txt", "", function(err) {
    queue = []
    knownUsers = []
    loadedUsers = []
    userCount = 0
    queue.push(cleanURL(datUrl))
    fs.readFile("./scrapedPortals.json", function(err, data) {
        if (err) { console.log(err) }
        try { 
            data = JSON.parse(data) 
            // remove start seed
            data.splice(data.indexOf(datUrl))
            console.log(data)
            loadedUsers = data
        } catch (e) {
            console.log(e)
        } finally {
            tick()
            saveScrapedPortals()
            writer()
        }
    })
    // })
}

main().then(function() {
    console.log(loadedUsers)
})

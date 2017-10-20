var Dat = require("dat-node")
var fs = require("fs")

var queue = []
var knownUsers = {}
var loadedUsers = {}
var userCount = 0

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

function readFile(path, url) {
    return new Promise((resolve, reject) => {
        Dat("./files", {key: url, temp: true, sparse: true}, (err, dat) => {
            if (err) {
              console.log(err)
              reject(err)
            }
            var network = dat.joinNetwork()
            dat.archive.readFile(path, function(err, data) {
                if (err) {
                  reject(err)
                }
                if (data) {
                  resolve(data.toString())
                } else {
                  resolve()
                }
                dat.close()
                network.close()
                dat.archive.close()
            })
        })
    })
}

function addUser(portal) {
	if(loadedUsers[portal.dat]) return
	loadedUsers[portal.dat] = true
	
	++userCount
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
	if(loadedUsers[url]) return
  let data = await readFile("/portal.json", url)
  let portal = JSON.parse(data)
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
}

function tick() {
    var timeElapsed = parseInt((new Date() - start) / 1000)
    console.log(process.memoryUsage())
    if(timeElapsed < DEADLINE) {
        if (queue.length) {
          let url = queue.shift()
          console.log('loading', url)
          loadSite(url)
        }
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
        var data = arr.map(JSON.stringify).join("\n")
        fs.appendFile("./scraped.txt", data, writer)
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
    queue = [cleanURL(datUrl)]
    knownUsers = {}
    loadedUsers = {}
    userCount = 0
    try { 
        require('./scrapedPortals.json').forEach((portal) => {
          loadedUsers[portal] = true
        })
    } catch (e) {
      console.log(e)
    }

    tick()
    saveScrapedPortals()
    writer()
}

main().then(function() {
    console.log(loadedUsers)
})

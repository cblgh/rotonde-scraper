const Dat = require("dat-node")
const fs = require("fs")
const datUrl = "dat://7f2ef715c36b6cd226102192ba220c73384c32e4beb49601fb3f5bba4719e0c5/"
const queue = [cleanURL(datUrl)]
const knownUsers = {}
const loadedUsers = {}
const scrapedUsers = [] // mirrors loadedUsers, but used for saving to file (attempted hack for fixing segfaults)
const DEADLINE = 10 * 60
const start = new Date()

var userCount = 0
var writer

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
                return reject(err)
            }
            var network = dat.joinNetwork()
            dat.archive.readFile(path, function(err, data) {
                if (err) {
                    return reject(err)
                }

                dat.leave()
                dat.close()

                resolve(data && data.toString())
            })
        })
    })
}

function processUser(portal) {
	if(loadedUsers[portal.dat]) return
	loadedUsers[portal.dat] = true
	
  if (portal.feed) {
      writer.write(JSON.stringify(portal.feed))
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
  var data
  try {
    data = await readFile("/portal.json", url)
  } catch (e) {
    console.log(e)
    return
  }

  if (data) {
    processUser(JSON.parse(data))
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

// save scraped portals to mitigate intermittent crash with dat-node
// when closing utp connections (i.e. we can pickup where we left off)
function saveScrapedPortals() {
    var data = JSON.stringify(scrapedUsers)
    fs.writeFile("./portals.json", data, function(err) {
        if (err) { throw err }
        setTimeout(saveScrapedPortals, 1000)
    })
}

async function main() {
    try { 
        var scrapedUsers = require('./portals.json')
        scrapedUsers.forEach((portal) => {
          loadedUsers[portal] = true
        })
    } catch (e) {
      console.log(e)
    }

    fs.stat('./scraped.txt', function(err, stats) {
      // create the file if it doesn't exist
      var size
      if (err && err.code === 'ENOENT') {
        fs.closeSync(fs.openSync('./scraped.txt', 'w'))
        size = 0
      } else {
        size = stats.size
      }

      writer = fs.createWriteStream('./scraped.txt', {
        autoClose: true,
        start: size
      })
      tick()
      saveScrapedPortals()
    })
}

main().then(function() {
    console.log(loadedUsers)
})

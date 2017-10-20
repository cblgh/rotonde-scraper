const Dat = require("dat-node")
const fs = require("fs")
const datUrl = "dat://7f2ef715c36b6cd226102192ba220c73384c32e4beb49601fb3f5bba4719e0c5/"
const queue = [cleanURL(datUrl)]
const knownUsers = new Set()
const loadedUsers = new Set()
const DEADLINE = 10 * 60
const start = new Date()

const scrapedDataPath = './scraped.txt'
const seenPortalFile = './portals.json'

const maxConcurrent = 1
var numProcessing = 0

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
  if(loadedUsers.has(portal.dat)) return

  if (portal.feed) {
    writer.write(portal.feed.map(JSON.stringify).join('\n'))
  }

  loadedUsers.add(portal.dat)

  // crawl the list of portals
  for(let i=0; i<portal.port.length; ++i) {
    let p = cleanURL(portal.port[i])
    if(!knownUsers.has(p)) {
      knownUsers.add(p)
      queue.push(p)
    }
  }

  console.log(`finishing ${portal.dat}`)
  --numProcessing
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
  if(loadedUsers.has(url)) return
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

  while (queue.length && (numProcessing < maxConcurrent)) {
    ++numProcessing
    var url = queue.shift()
    console.log(`processing ${url}`)
    loadSite(url)
  }
}

// save scraped portals to mitigate intermittent crash with dat-node
// when closing utp connections (i.e. we can pickup where we left off)
function saveScrapedPortals() {
  var data = JSON.stringify(Array.from(loadedUsers.entries()))
  fs.writeFile(seenPortalFile, data, function(err) {
    if (err) { throw err }
    setTimeout(saveScrapedPortals, 1000)
  })
}

async function main() {
  try { 
    require(seenPortalFile).forEach((portal) => {
      loadedUsers.add(portal)
    })
  } catch (e) {
    console.log(e)
  }

  fs.stat(scrapedDataPath, function(err, stats) {
    // create the file if it doesn't exist
    var size
    if (err && err.code === 'ENOENT') {
      fs.closeSync(fs.openSync(scrapedDataPath, 'w'))
      size = 0
    } else {
      size = stats.size
    }

    writer = fs.createWriteStream(scrapedDataPath, {
      autoClose: true,
      start: size
    })
    loadSite(queue.pop())
    saveScrapedPortals()
  })
}

main().then(function() {
  console.log(loadedUsers)
})

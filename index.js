const Dat = require("dat-node")
const fs = require("fs")
const datUrl = "dat://7f2ef715c36b6cd226102192ba220c73384c32e4beb49601fb3f5bba4719e0c5/"
const queue = [cleanURL(datUrl)]
const knownUsers = new Set()
const DEADLINE = 10 * 60
const start = new Date()

const scrapedDataPath = './scraped.txt'
const seenPortalFile = './portals.json'
const seenPortalDelimiter = '\n'

const maxConcurrent = 2
var numProcessing = 0

var loadedUsers = new Set()
var userCount = 0
var writer
var portalWriter

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
  if(!loadedUsers.has(portal.dat)) {

    if (portal.feed) {
      writer.write(portal.feed.map(function(msg) {
          msg["source"] = portal.dat
          return JSON.stringify(msg)
      })
      .join('\n'))
    }

    portalWriter.write(portal.dat + seenPortalDelimiter)
    loadedUsers.add(portal.dat)
  }

  // crawl the list of portals
  for(let i=0; i<portal.port.length; ++i) {
    let p = cleanURL(portal.port[i])
    if(!knownUsers.has(p)) {
      knownUsers.add(p)
      queue.push(p)
    }
  }

  console.log(`finishing ${portal.dat}`)
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
  var data
  try {
    data = await readFile("/portal.json", url)
  } catch (e) {
    console.log(e)
  }

  if (data) {
    processUser(JSON.parse(data))
  }
  --numProcessing

  while (queue.length && (numProcessing < maxConcurrent)) {
    ++numProcessing
    var url = queue.shift()
    console.log(`processing ${url}`)
    loadSite(url)
  }
}

async function main() {
    try { 
      fs
        .readFileSync(seenPortalFile)
        .toString()
        .split(seenPortalDelimiter)
        .forEach((portal) => {
          if (portal) {
            loadedUsers.add(portal)
          }
        }
      )
    } catch (e) {
      console.log(e)
    }

    createWriteStream(scrapedDataPath).then((stream) => {
        writer = stream
        return createWriteStream(seenPortalFile)
    }).then((stream) => {
        portalWriter = stream
        loadSite(queue.pop())
  })
}

function createWriteStream(path) {
    var stream
    return new Promise((resolve, reject) => {
        fs.stat(path, function(err, stats) {
            // create the file if it doesn't exist
            var size
            if (err && err.code === 'ENOENT') {
                fs.closeSync(fs.openSync(path, 'w'))
                size = 0
            } else {
                size = stats.size
            }

            stream = fs.createWriteStream(path, {
                flags: 'r+',
                autoClose: true,
                start: size
            })
            resolve(stream)
        })
    })
}

main().then(function() {
  console.log(loadedUsers)
})

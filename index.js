const Dat = require("dat-node")
const fs = require("fs")
const datResolve = require("dat-link-resolve")

const START_DAT = "dat://7f2ef715c36b6cd226102192ba220c73384c32e4beb49601fb3f5bba4719e0c5/"
const queue = [cleanURL(START_DAT)]
const knownUsers = new Set()
const TIMEOUT = 60 * 1000
const start = new Date()

const scrapedDataPath = './scraped.txt'
const seenPortalFile = './network.txt'
const metadataFile = "./metadata.txt"
const seenPortalDelimiter = '\n'

module.exports = {dataPath: scrapedDataPath, networkPath: seenPortalFile, metadataPath: metadataFile}

const maxConcurrent = 2
var numProcessing = 0

var loadedUsers = new Set()
var userCount = 0
var writer
var portalWriter
var metadataWriter

/* KNOWN ERRORS:
 * node: src/unix/udp.c:67: uv__udp_finish_close: Assertion
 * `!uv__io_active(&handle->io_watcher, POLLIN | POLLOUT)' failed.
 *
 * CAUSE: something in dat-node that fails when closing utp connections
 *
 */

function readFile(path, url) {
  return new Promise((resolve, reject) => {
    Dat("./files", {key: url, temp: true, sparse: true}, (err, dat) => {
      var isFinished = false
      if (err) {
        return reject(err)
      }

      // the request has essentially timed out; abort
      setTimeout(() => {
          if (!isFinished) {
              dat.leave()
              dat.close()
          }
          reject(new Error(`Dat download for ${url} timed out`))
      }, TIMEOUT)

      var network = dat.joinNetwork()
      dat.archive.readFile(path, function(err, data) {
        isFinished = true 
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
          msg["source"] = portal.dat // add originator of message
          return JSON.stringify(msg)
      })
      .join('\n'))
    }

    portalWriter.write(`${portal.name || "none"} ${portal.dat + seenPortalDelimiter}`)
    portal.feed = [] // clear feed before writing metadata
    metadataWriter.write(`${portal.dat} ${JSON.stringify(portal) + seenPortalDelimiter}`)
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
    if (typeof url === "string") {
        url = url.trim()
        while(url[url.length-1] == "/") {
            url = url.slice(0, -1)
        }
        return url + "/"
    } 
    return url
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
      var portal = JSON.parse(data)
      portal.dat = await resolveName(portal.dat)

      // resolve all target urls
      portal.feed = await Promise.all(portal.feed.map((msg) => {
          return new Promise(async (resolve, reject) => {
              if (msg.target) {
                  msg.target = await resolveName(msg.target) 
              }
              return resolve(msg)
          })
      }))

      // resolve all ports
      portal.port = await Promise.all(portal.port.map(async (port) => {
          return await resolveName(port)
      }))
      processUser(portal)
  }
  --numProcessing

  while (queue.length && (numProcessing < maxConcurrent)) {
    ++numProcessing
    var url = queue.shift()
    console.log(`processing ${url}`)
    loadSite(url)
  }
}

function resolveName(url) {
    return new Promise((resolve, reject) => {
        datResolve(url, (e, resolvedUrl) => {
            if (e) { return reject(e) }
            resolve(`dat://${resolvedUrl}/`)
        })
    })
}

async function main() {
    try { 
      fs
        .readFileSync(seenPortalFile)
        .toString()
        .split(seenPortalDelimiter)
        .forEach((portal) => {
          if (portal) {
            loadedUsers.add(portal.split(" ")[1])
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
        return createWriteStream(metadataFile)
    }).then((stream) => {
        metadataWriter = stream
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

// only scrape if called directly
if (require.main === module) {
    main().then(() => {
      console.log(loadedUsers)
    })
}

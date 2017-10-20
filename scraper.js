var currentIndex = 0
var queue = []

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
        return new Promise((resolve, reject) => {
            if (this.dat) {
                this.dat.close(function() { 
                    console.log("closed!") 
                    resolve()
                })
            } else {
                resolve()
            }
        })
    }
}

function cleanURL(url) {
	url = url.trim()
	while(url[url.length-1] == "/") {
		url = url.slice(0, -1)
	}
	return url + "/"
}

function loadSite() {
    return new Promise(function(resolve, reject) {
        if (queue.length === 0) {
            console.log("we're finished")
            cleanup()
        }
        var url = queue.shift()
        let archive = new DatArchive(url)
        try {
            let data = await archive.readFile("/portal.json")
            let portal = JSON.parse(data)
            archive.close().then(() => {
                return write(portal)
            }).then(resolve)
        } catch(err) {
            console.log(err)
            archive.close()
        }
    })
}

function write(portal) {
    return new Promise((resolve, reject) => {
        if (portal.feed) {
            var data = portal.feed.map((item) => { return JSON.stringify(item) }).join("\n")
            fs.appendFile("./scraped.txt", data, function(err) {
                if (err) { reject(err)}
                resolve()
            })
        } else { resolve() }
    }).then(function() {
        return new Promise((resolve, reject) => {
            fs.writeFile("./portalIndex", ++currentIndex; function(err) {
                if (err) { reject(err)}
                resolve()
            })
        })
    })
}

function cleanup() {
    process.exit()
}

// question: how do i do a blocking while True: with promises?
// if i use recursion in loadSite the memory's just gonna start leaking due to increasing stack frames
function start() {
    return new Promise((resolve, reject) => {
    fs.readFile("./portalIndex", (err, data) => {
        if (err) {
            console.log(err)
        } else {
            currentIndex = parseInt(data)
        }
        resolve()
    }).then(function() {
        fs.readFile("./portals", (err, data) => {
            var queue = JSON.parse(data)
            loadSite()
        })
    })
}

// Tiny static server — only needed when editing the MODULAR prototype
// (ES modules don't load over file://). No dependencies.
//   node serve.cjs        -> http://127.0.0.1:5183
// For just LOOKING at the prototype, open Costudy-UI-原型.html instead.
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, 'costudy-ui')
const PORT = Number(process.env.PORT || 5183)

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent((req.url || '/').split('?')[0])
  if (rel === '/') rel = '/index.html'
  const file = path.join(ROOT, rel)
  // prevent escaping the prototype dir
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden')
    return
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found: ' + rel)
      return
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store',
    })
    res.end(buf)
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log('prototype server: http://127.0.0.1:' + PORT + '/')
  console.log('root: ' + ROOT)
  console.log('(Ctrl+C to stop. For just viewing, open Costudy-UI-原型.html instead.)')
})

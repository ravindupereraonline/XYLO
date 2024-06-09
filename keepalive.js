const http = require('http');

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('XYLO is Live');
}).listen(3000); // Listen on port 3000

console.log('Keep alive server is running...');

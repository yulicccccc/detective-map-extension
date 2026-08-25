// scripts/download-peerjs.js
const https = require('https');
const fs = require('fs');
const path = require('path');

const dest = path.join(__dirname, '..', 'shared', 'peerjs.min.js');
const file = fs.createWriteStream(dest);

function get(url) {
  https.get(url, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      get(res.headers.location);
      return;
    }
    res.pipe(file);
    file.on('finish', () => {
      file.close();
      console.log('Downloaded peerjs.min.js successfully (' + fs.statSync(dest).size + ' bytes)');
    });
  }).on('error', (err) => {
    fs.unlink(dest, () => {});
    console.error('Failed to download peerjs:', err.message);
  });
}

get('https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js');

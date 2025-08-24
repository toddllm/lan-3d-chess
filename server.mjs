// Simple LAN WebSocket relay for 2-player games
// Run: node server.js

import http from 'http';
import { WebSocketServer } from 'ws';
import { readFile } from 'fs/promises';
import path from 'path';
import url from 'url';
import os from 'os';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');

// In-memory game rooms
const rooms = new Map(); // gameId -> { clients: Set<ws>, colorByClient: Map<ws,'w'|'b'>, fen: string }

const server = http.createServer(async (req, res) => {
  console.log(`[HTTP] ${req.method} ${req.url} from ${req.socket.remoteAddress}`);
  try {
    const parsed = new URL(req.url, `http://${req.headers.host}`);
    // Serve built files from dist/ with fallback to index.html
    let filePath = path.join(distDir, parsed.pathname === '/' ? '/index.html' : parsed.pathname);
    // Basic security
    if (!filePath.startsWith(distDir)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    let content;
    try {
      content = await readFile(filePath);
    } catch {
      // Fallback to index.html for SPA routes
      const indexPath = path.join(distDir, 'index.html');
      console.log('[HTTP] Serving index.html as fallback');
      content = await readFile(indexPath);
      filePath = indexPath; // Update filePath for extension check
    }
    
    // Inject polyfill for ALL HTML files
    if (filePath.endsWith('.html')) {
      const lanIp = detectLanIPv4();
      console.log(`[HTTP] Serving HTML file, LAN IP detected: ${lanIp}`);
      if (lanIp) {
        const clipboardPolyfill = `
        <script>
          console.log('[POLYFILL] Injecting clipboard polyfill');
          window.__LAN_IP__='${lanIp}';
          // Clipboard polyfill for HTTP contexts
          if (!navigator.clipboard) {
            console.log('[POLYFILL] navigator.clipboard not found, adding polyfill');
            navigator.clipboard = {
              writeText: function(text) {
                console.log('[POLYFILL] writeText called with:', text);
                return new Promise(function(resolve, reject) {
                  const textarea = document.createElement('textarea');
                  textarea.value = text;
                  textarea.style.position = 'fixed';
                  textarea.style.opacity = '0';
                  document.body.appendChild(textarea);
                  textarea.select();
                  try {
                    const successful = document.execCommand('copy');
                    document.body.removeChild(textarea);
                    if (successful) {
                      console.log('[POLYFILL] Copy successful');
                      resolve();
                    } else {
                      console.log('[POLYFILL] Copy command failed');
                      reject(new Error('Copy command failed'));
                    }
                  } catch (err) {
                    console.log('[POLYFILL] Copy error:', err);
                    document.body.removeChild(textarea);
                    reject(err);
                  }
                });
              }
            };
          } else {
            console.log('[POLYFILL] navigator.clipboard already exists');
          }
        </script>`;
        console.log('[HTTP] Injecting polyfill into HTML');
        content = Buffer.from(String(content).replace('</head>', clipboardPolyfill + '</head>'));
      }
    }
    const ext = path.extname(filePath);
    const type = ext === '.html' ? 'text/html' : ext === '.js' ? 'application/javascript' : ext === '.css' ? 'text/css' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(content);
  } catch (e) {
    res.writeHead(500); res.end('Server error');
  }
});

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws, request, client) => {
  console.log(`[WS] New connection: ${request.url}`);
  const urlObj = new URL(request.url, `http://${request.headers.host}`);
  const gameId = urlObj.searchParams.get('game');
  console.log(`[WS] Game ID: ${gameId}`);
  if (!gameId) { 
    console.log('[WS] No game ID provided, closing connection');
    ws.close(); 
    return; 
  }

  if (!rooms.has(gameId)) {
    console.log(`[ROOM] Creating new room for game: ${gameId}`);
    rooms.set(gameId, { clients: new Set(), colorByClient: new Map(), fen: undefined });
  }
  const room = rooms.get(gameId);
  room.clients.add(ws);
  console.log(`[ROOM] Client joined game ${gameId}. Total clients: ${room.clients.size}`);

  // Assign color
  let color = 'w';
  const colorsInUse = new Set(room.colorByClient.values());
  if (!colorsInUse.has('w')) color = 'w'; else if (!colorsInUse.has('b')) color = 'b'; else color = Math.random() < 0.5 ? 'w' : 'b';
  room.colorByClient.set(ws, color);
  console.log(`[ROOM] Assigned color ${color} to client in game ${gameId}`);

  const assignMsg = JSON.stringify({ type: 'assign', color });
  console.log(`[WS] Sending to client: ${assignMsg}`);
  ws.send(assignMsg);
  if (room.fen) {
    const stateMsg = JSON.stringify({ type: 'state', fen: room.fen });
    console.log(`[WS] Sending existing state: ${stateMsg}`);
    ws.send(stateMsg);
  }

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      console.log(`[WS] Received message: ${JSON.stringify(msg)}`);
      if (msg.type === 'hello' && msg.gameId === gameId) {
        console.log(`[WS] Hello from client in game ${gameId}`);
        // Respond with latest state
        if (room.fen) {
          const stateMsg = JSON.stringify({ type: 'state', fen: room.fen });
          console.log(`[WS] Sending current state: ${stateMsg}`);
          ws.send(stateMsg);
        }
      } else if (msg.type === 'move' && msg.gameId === gameId) {
        console.log(`[WS] Move in game ${gameId}: ${msg.move}`);
        room.fen = msg.fen;
        // Broadcast to others
        let broadcastCount = 0;
        for (const client of room.clients) {
          if (client !== ws && client.readyState === 1) {
            client.send(JSON.stringify({ type: 'move', move: msg.move, fen: msg.fen }));
            broadcastCount++;
          }
        }
        console.log(`[WS] Broadcasted move to ${broadcastCount} other clients`);
      }
    } catch (e) {
      console.log(`[WS] Error processing message: ${e.message}`);
    }
  });

  ws.on('close', () => {
    console.log(`[WS] Client disconnected from game ${gameId}`);
    room.clients.delete(ws);
    room.colorByClient.delete(ws);
    if (room.clients.size === 0) {
      console.log(`[ROOM] Game ${gameId} is empty, removing room`);
      rooms.delete(gameId);
    } else {
      console.log(`[ROOM] Game ${gameId} has ${room.clients.size} clients remaining`);
    }
  });
});

server.on('upgrade', (request, socket, head) => {
  console.log(`[UPGRADE] WebSocket upgrade request: ${request.url}`);
  const urlObj = new URL(request.url, `http://${request.headers.host}`);
  console.log(`[UPGRADE] Pathname: ${urlObj.pathname}`);
  if (urlObj.pathname === '/ws') {
    console.log('[UPGRADE] Valid /ws path, handling upgrade');
    wss.handleUpgrade(request, socket, head, function done(ws) {
      wss.emit('connection', ws, request);
    });
  } else {
    console.log(`[UPGRADE] Invalid path ${urlObj.pathname}, rejecting connection`);
    socket.destroy();
  }
});

const PORT = process.env.PORT || 5174;
server.listen(PORT, () => {
  const ip = detectLanIPv4();
  console.log(`Server running on http://localhost:${PORT}`);
  if (ip) console.log(`LAN: http://${ip}:${PORT}`);
});

function detectLanIPv4() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        // Private ranges
        if (
          net.address.startsWith('10.') ||
          net.address.startsWith('192.168.') ||
          net.address.startsWith('172.16.') ||
          net.address.startsWith('172.17.') ||
          net.address.startsWith('172.18.') ||
          net.address.startsWith('172.19.') ||
          net.address.startsWith('172.20.') ||
          net.address.startsWith('172.21.') ||
          net.address.startsWith('172.22.') ||
          net.address.startsWith('172.23.') ||
          net.address.startsWith('172.24.') ||
          net.address.startsWith('172.25.') ||
          net.address.startsWith('172.26.') ||
          net.address.startsWith('172.27.') ||
          net.address.startsWith('172.28.') ||
          net.address.startsWith('172.29.') ||
          net.address.startsWith('172.30.') ||
          net.address.startsWith('172.31.')
        ) return net.address;
      }
    }
  }
  return null;
}

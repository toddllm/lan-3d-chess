# LAN 3D Chess

A multiplayer 3D chess game that works over local network (LAN) connections. Play chess with friends on the same network without needing an internet connection.

## Features

- 3D chess board visualization
- Local network multiplayer support via WebSocket
- Automatic color assignment (white/black)
- Real-time move synchronization
- No internet required - works entirely on LAN

## Installation

1. Clone the repository:
```bash
git clone https://github.com/toddllm/lan-3d-chess.git
cd lan-3d-chess
```

2. Install dependencies:
```bash
npm install
```

## Usage

### Starting the Server

1. Start the server on one computer:
```bash
node server.mjs
```

The server will display:
```
Server running on http://localhost:5174
LAN: http://192.168.x.x:5174
```

### Playing the Game

#### Host Player (creates the game):
1. Open browser and go to the LAN address shown (e.g., `http://192.168.x.x:5174`)
2. Click "Create LAN Game"
3. A shareable link will appear
4. Click "Copy" to copy the invite link
5. Share this link with your opponent

#### Guest Player (joins the game):
1. Receive the invite link from the host
2. Open the link in a browser
3. You'll automatically join the game and be assigned the opposite color

### Game Controls

- **Click and drag** pieces to make moves
- **Auto-queen**: Pawns automatically promote to queens (can be toggled off)
- **Flip on turn**: Board automatically rotates for the current player (can be toggled off)
- **New Game**: Start a fresh game at any time
- **Leave LAN**: Disconnect from the current LAN game

## Technical Details

- WebSocket server for real-time communication
- Supports multiple simultaneous games via game IDs
- Automatic reconnection on network issues
- Works on any device with a modern web browser

## Requirements

- Node.js 14 or higher
- Modern web browser (Chrome, Firefox, Safari, Edge)
- All players must be on the same local network

## Troubleshooting

### Can't connect to game
- Ensure both players are on the same network
- Check firewall settings - port 5174 must be accessible
- Try using the IP address directly instead of hostname
- Make sure the server is still running

### Copy button doesn't work
- The clipboard polyfill is included for HTTP contexts
- If it still doesn't work, manually select and copy the link from the input field

### Game not syncing
- Check the server console for error messages
- Refresh both browsers
- Ensure WebSocket connections are not blocked by antivirus/firewall

## Development

The server includes detailed logging for debugging:
- HTTP requests
- WebSocket connections
- Game room management
- Move broadcasting

Monitor server output to troubleshoot connection issues.

## License

MIT
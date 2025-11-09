// server/server.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const { createServer } = require('http');
const { Server } = require('socket.io');

const Rooms = require('./rooms');
const DrawingState = require('./drawing-state');

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use((req,res,next)=>{ console.log(new Date().toISOString(), req.method, req.url); next(); });

const staticDir = path.join(__dirname, '..', 'client');
console.log('Serving static files from:', staticDir);
app.use(express.static(staticDir));

const rooms = new Rooms();
const states = new Map();

function persistPathFor(roomId) {
  return path.join(__dirname, `../persist/history-${roomId}.json`);
}

function ensureRoom(roomId) {
  if (!rooms.hasRoom(roomId)) {
    rooms.createRoom(roomId);
    console.log('Created room:', roomId);
  }
  if (!states.has(roomId)) states.set(roomId, new DrawingState());

  // Load persisted file if available and state empty
  try {
    const p = persistPathFor(roomId);
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf8');
      if (raw && raw.trim().length > 0) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          const st = states.get(roomId);
          if (st && typeof st.getHistory === 'function' && st.getHistory().length === 0) {
            st.loadHistory(arr);
            console.log(`Loaded persisted history for room "${roomId}" (${arr.length} ops)`);
          }
        }
      }
    }
  } catch (err) {
    console.warn('ensureRoom persistence load failed', err);
  }
}

// Save/load endpoints
app.post('/save', (req, res) => {
  const { roomId } = req.body || {};
  if (!roomId) return res.status(400).json({ ok: false, error: 'roomId required' });
  const state = states.get(roomId);
  if (!state) return res.status(404).json({ ok: false, error: 'no such room' });

  try {
    const outPath = persistPathFor(roomId);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(state.getHistory(), null, 2), 'utf8');
    console.log(`Saved history for room "${roomId}" to ${outPath}`);
    try { io.to(roomId).emit('saved_session', { roomId, path: outPath }); } catch(e){}
    return res.json({ ok: true, path: outPath });
  } catch (err) {
    console.error('save err', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/load', (req, res) => {
  const roomId = req.query.roomId || 'main';
  const file = persistPathFor(roomId);
  if (!fs.existsSync(file)) return res.json({ ok: false, error: 'no saved session', history: [] });
  try {
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    ensureRoom(roomId);
    const st = states.get(roomId);
    if (st && typeof st.loadHistory === 'function') st.loadHistory(json);
    console.log(`Loaded persisted file on /load for room "${roomId}" (${Array.isArray(json) ? json.length : 0} ops)`);
    return res.json({ ok: true, history: json });
  } catch (err) {
    console.error('load err', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Socket.IO handling
io.on('connection', (socket) => {
  const roomId = (socket.handshake.query && socket.handshake.query.roomId) ? socket.handshake.query.roomId : 'main';
  ensureRoom(roomId);

  console.log('socket connected', socket.id, 'room', roomId);

  const user = { id: socket.id, name: 'User_' + Math.random().toString(6), color: randomColor() };
  try { rooms.addUser(roomId, user); } catch (e) { console.warn('rooms.addUser failed', e); }
  socket.join(roomId);

  const state = states.get(roomId);
  const hist = (state && typeof state.getHistory === 'function') ? state.getHistory() : [];
  socket.emit('state_init', { history: hist, users: rooms.getUsers(roomId) });
  io.to(roomId).emit('user_update', rooms.getUsers(roomId));

  socket.on('cursor', (data) => {
    const payload = { userId: socket.id, x: data.x, y: data.y, color: user.color, name: user.name };
    socket.to(roomId).emit('cursor', payload);
  });

  socket.on('op', (data) => {
    const room = (data && data.roomId) || roomId;
    const op = (data && data.op) || data;
    if (!op || !op.id || !op.type || !op.userId) {
      console.warn('Received invalid op, ignoring. op=', JSON.stringify(op).slice(0,200));
      return;
    }
    op.serverTs = Date.now();
    ensureRoom(room);
    const st = states.get(room);
    try { if (st && typeof st.appendOp === 'function') st.appendOp(op); } catch (e) { console.warn('appendOp error', e); }
    console.log(`Received op ${op.id} type=${op.type} from ${op.userId} room=${room}`);
    io.to(room).emit('op_broadcast', { op });
  });

  socket.on('undo_request', (d) => {
    const room = (d && d.roomId) || roomId;
    ensureRoom(room);
    const st = states.get(room);
    const target = (typeof st.findLastUndoable === 'function') ? st.findLastUndoable() : null;
    if (target) {
      try { st.markUndone(target.id); } catch(e){ console.warn('markUndone err', e); }
      io.to(room).emit('undo_broadcast', { id: socket.id + '_' + Date.now(), targetOpId: target.id });
    }
  });

  socket.on('redo_request', (d) => {
    const room = (d && d.roomId) || roomId;
    ensureRoom(room);
    const st = states.get(room);
    const target = (typeof st.findLastUndone === 'function') ? st.findLastUndone() : null;
    if (target) {
      try { st.markRedone(target.id); } catch(e){ console.warn('markRedone err', e); }
      io.to(room).emit('redo_broadcast', { id: socket.id + '_' + Date.now(), targetOpId: target.id });
    }
  });

  socket.on('ping_ts', (d, ack) => { if (ack) ack({ t: d.t }); });

  socket.on('disconnect', (reason) => {
    console.log('disconnect', socket.id, 'room', roomId, 'reason:', reason);
    try { rooms.removeUser(roomId, socket.id); } catch(e){ console.warn('removeUser err', e); }
    io.to(roomId).emit('user_update', rooms.getUsers(roomId));
  });
});

server.listen(PORT, () => { console.log('listening on', PORT); });

function randomColor(){
  const h = Math.floor(Math.random()*360);
  return `hsl(${h} 70% 45%)`;
}

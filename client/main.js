// main.js – FINAL FIXED VERSION (stable connection, cross-tab sync working)

(function(){
  console.log('[MAIN] loaded');
  const CanvasApp = window.CanvasApp;
  const WS = window.WS;

  if(!CanvasApp || !WS) {
    console.error('[MAIN] Missing CanvasApp or WS wrapper.');
    return;
  }

  let currentRoom = 'main';
  let connected = false;
  let joinLock = false;

  // ---- JOIN ROOM ----
  function joinRoom(roomName) {
    if(joinLock) return;
    joinLock = true;

    currentRoom = roomName || 'main';
    console.log('[MAIN] Joining room', currentRoom);

    try { WS.disconnect(); } catch(e) {}

    // Connect socket
    WS.connect(currentRoom);

    WS.on('connect', () => {
      connected = true;
      joinLock = false;
      const sid = WS.id();
      console.log('[MAIN] Connected as', sid, 'in room', currentRoom);
      CanvasApp.setClientId(sid);
      CanvasApp.setRoomId(currentRoom);
    });

    WS.on('disconnect', reason => {
      connected = false;
      console.warn('[MAIN] Disconnected:', reason);
    });

    WS.on('op_broadcast', data => {
      const op = data.op || data;
      CanvasApp.applyRemoteOp(op);
    });

    WS.on('state_init', (state) => {
      console.log('[MAIN] State init received', state);
      if(Array.isArray(state.history)) {
        const hist = window.__CANVAS_INTERNAL.historyRef;
        hist.length = 0;
        for(const op of state.history) hist.push(op);
        CanvasApp.rebuild();
      }
      if(state.users) {
        for(const u of Object.values(state.users))
          CanvasApp.updateCursor(u.id, { name:u.name, color:u.color });
      }
    });

    WS.on('user_update', (users) => {
      for(const u of Object.values(users))
        CanvasApp.updateCursor(u.id, { name:u.name, color:u.color });
    });

    WS.on('cursor', (data) => {
      CanvasApp.updateCursor(data.userId, {
        x: data.x, y: data.y, color: data.color, name: data.name
      });
    });
  }

  // ---- UI BINDINGS ----
  document.getElementById('join-room-btn').addEventListener('click', () => {
    const room = document.getElementById('room-input').value.trim() || 'main';
    joinRoom(room);
  });

  document.getElementById('tool-select').addEventListener('change', e => CanvasApp.setTool(e.target.value));
  document.getElementById('color-picker').addEventListener('input', e => CanvasApp.setColor(e.target.value));
  document.getElementById('size-range').addEventListener('input', e => CanvasApp.setSize(parseInt(e.target.value,10)));

  document.getElementById('undo-btn').addEventListener('click', ()=> CanvasApp.requestUndo());
  document.getElementById('redo-btn').addEventListener('click', ()=> CanvasApp.requestRedo());

  document.getElementById('save-btn').addEventListener('click', ()=> {
    if(!connected){ alert('Join the room first.'); return; }
    fetch('/save', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ roomId: currentRoom })
    }).then(r=>r.json()).then(j=>{
      if(j.ok) alert('Saved session for room ' + currentRoom);
      else alert('Save failed: ' + j.error);
    });
  });

  document.getElementById('load-btn').addEventListener('click', ()=> {
    if(!connected){ alert('Join the room first.'); return; }
    fetch('/load?roomId=' + encodeURIComponent(currentRoom))
      .then(r=>r.json()).then(j=>{
        if(Array.isArray(j.history)){
          const hist = window.__CANVAS_INTERNAL.historyRef;
          hist.length = 0;
          for(const op of j.history) hist.push(op);
          CanvasApp.rebuild();
          alert('Loaded session for room ' + currentRoom);
        } else alert('No saved data for this room.');
      });
  });

  // ---- IMAGE INPUT ----
  const imgInput = document.getElementById('image-file');
  imgInput.addEventListener('change', ev => {
    const f = ev.target.files && ev.target.files[0];
    if(!f || !connected) return;
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target.result;
      const imgId = 'img_' + Math.random().toString(36).slice(2,9);
      const canvasEl = document.getElementById('draw-canvas');
      const rect = canvasEl.getBoundingClientRect();
      const payload = {
        id: imgId, x: rect.width/4, y: rect.height/4,
        w: rect.width/2, h: rect.height/2, dataUrl
      };
      const op = { id: 'op_'+Math.random().toString(36).slice(2,10),
        type:'image', userId: WS.id(), payload };
      WS.emit('op', { roomId: currentRoom, op });
    };
    reader.readAsDataURL(f);
  });

  // ---- LATENCY MONITOR ----
  setInterval(()=> {
    if(!connected) return;
    const start = Date.now();
    WS.emit('ping_ts', { t:start, roomId: currentRoom }, pong => {
      const ms = Date.now() - start;
      document.getElementById('latency').textContent = 'Latency: ' + ms + 'ms';
    });
  }, 3000);

  // ---- INIT ----
  CanvasApp.init();
  document.getElementById('room-input').value = 'main';

  // Delayed auto-join (prevents double connection bug)
  window.addEventListener('load', () => {
    setTimeout(() => {
      joinRoom('main');
    }, 500);
  });

  // Graceful cleanup
  window.addEventListener('beforeunload', () => {
    try { WS.disconnect(); } catch(e){}
  });

})();

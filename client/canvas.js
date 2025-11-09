(() => {
  const canvas = document.getElementById('draw-canvas');
  const ctx = canvas.getContext('2d', { alpha: true });
  let dpr = window.devicePixelRatio || 1;

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
    rebuildCanvasFromHistory();
  }
  window.addEventListener('resize', debounce(resizeCanvas, 100));
  setTimeout(resizeCanvas, 20);

  // state
  const history = [];
  let clientId = null;
  let currentTool = 'brush';
  let currentColor = '#000';
  let currentSize = 4;
  let drawing = false;
  let currentPath = [];
  const cursors = new Map();
  let roomId = 'main';
  const imagesCache = new Map();

  // metrics
  let frames = 0, lastFpsTs = performance.now(), fps = 0;
  let opsCount = 0, lastOpRateTs = performance.now(), opRate = 0;
  function tickMetrics(){
    frames++;
    const now = performance.now();
    if(now - lastFpsTs >= 1000){
      fps = Math.round((frames*1000)/(now-lastFpsTs));
      const el = document.getElementById('fps'); if(el) el.textContent = 'FPS: ' + fps + ' ';
      frames = 0; lastFpsTs = now;
    }
    requestAnimationFrame(tickMetrics);
  }
  requestAnimationFrame(tickMetrics);

  function updateOpRate(){
    const now = performance.now();
    if(now - lastOpRateTs >= 1000){
      opRate = opsCount; opsCount = 0; lastOpRateTs = now;
      const el = document.getElementById('oprate'); if(el) el.textContent = 'Ops/s: ' + opRate + ' ';
    }
  }

  // drawing primitives
  function drawStroke(points, color, width, erase=false){
    if(!points || points.length===0) return;
    ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.strokeStyle = color || '#000';
    ctx.lineWidth = width || 4;
    ctx.beginPath();
    for(let i=0;i<points.length;i++){
      const p = points[i];
      if(i===0) ctx.moveTo(p.x,p.y);
      else ctx.lineTo(p.x,p.y);
    }
    ctx.stroke();
    ctx.closePath();
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawRect(rect, color, width){
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = width || 2;
    ctx.strokeStyle = color || '#000';
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  }

  function drawText(obj){
    ctx.globalCompositeOperation = 'source-over';
    ctx.font = `${Math.max(12, obj.size||16)}px sans-serif`;
    ctx.fillStyle = obj.color||'#000';
    ctx.fillText(obj.text||'', obj.x, obj.y);
  }

  function drawImageOp(op){
    const { id, x, y, w, h, dataUrl } = op;
    const img = imagesCache.get(id);
    if(img && img.complete){ ctx.drawImage(img, x, y, w, h); return; }
    if(!imagesCache.has(id)){
      const im = new Image();
      im.onload = ()=> { imagesCache.set(id, im); rebuildCanvasFromHistory(); };
      im.src = dataUrl;
      imagesCache.set(id, im);
    }
  }

  function applyOpToCanvas(op, record=true){
    if(!op || !op.type) return;
    switch(op.type){
      case 'stroke': drawStroke(op.payload.points, op.payload.color, op.payload.width, false); break;
      case 'erase': drawStroke(op.payload.points, '#000', op.payload.width, true); break;
      case 'rect': drawRect(op.payload.rect, op.payload.color, op.payload.width); break;
      case 'text': drawText(op.payload); break;
      case 'image': drawImageOp(op.payload); break;
      case 'clear': ctx.clearRect(0,0,canvas.width,canvas.height); break;
      case 'undo': {
        const tid = op.payload.targetOpId;
        const target = history.find(h=>h.id===tid);
        if(target && !target._undone){ target._undone = true; rebuildCanvasFromHistory(); }
        break;
      }
      case 'redo': {
        const tid = op.payload.targetOpId;
        const target = history.find(h=>h.id===tid);
        if(target && target._undone){ delete target._undone; rebuildCanvasFromHistory(); }
        break;
      }
      default: break;
    }
    if(record){ history.push(op); opsCount++; updateOpRate(); }
  }

  function rebuildCanvasFromHistory(){
    if(!ctx) return;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for(const op of history){
      if(op._undone) continue;
      applyOpToCanvas(op, false);
    }
  }

  // input helpers
  function toCanvasCoord(clientX, clientY){
    const r = canvas.getBoundingClientRect();
    return { x: Math.round(clientX - r.left), y: Math.round(clientY - r.top) };
  }
  function getPointFromEvent(e){
    if(e.touches && e.touches[0]) e = e.touches[0];
    return toCanvasCoord(e.clientX, e.clientY);
  }

  function drawDot(pt){
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, Math.max(1, currentSize/2), 0, Math.PI*2);
    ctx.fillStyle = currentColor;
    ctx.fill();
  }

  function startPointer(e){
    e.preventDefault();
    drawing = true;
    currentPath = [];
    const p = getPointFromEvent(e);
    currentPath.push(p);
    if(currentTool === 'rect'){ canvas._rectStart = p; return; }
    if(currentTool === 'text'){ return; }
    drawDot(p);
    try { WS.emit('cursor', { x:p.x, y:p.y, roomId }); } catch(e){}
  }

  function movePointer(e){
    if(!drawing) return;
    const p = getPointFromEvent(e);
    if(currentTool === 'rect'){
      rebuildCanvasFromHistory();
      const s = canvas._rectStart;
      const rect = { x: Math.min(s.x,p.x), y: Math.min(s.y,p.y), w: Math.abs(s.x-p.x), h: Math.abs(s.y-p.y) };
      drawRect(rect, currentColor, currentSize);
      return;
    }
    if(currentTool === 'text' || currentTool === 'image') return;
    currentPath.push(p);
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.lineWidth = currentSize;
    ctx.strokeStyle = currentTool === 'eraser' ? 'rgba(0,0,0,1)' : currentColor;
    ctx.globalCompositeOperation = currentTool === 'eraser' ? 'destination-out' : 'source-over';
    if(currentPath.length >= 2){
      const a = currentPath[currentPath.length-2], b = currentPath[currentPath.length-1];
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); ctx.closePath();
    }
    ctx.globalCompositeOperation = 'source-over';
    if(currentPath.length % 6 === 0) flushPartial();
    try { WS.emit('cursor', { x:p.x, y:p.y, roomId }); } catch(e){}
  }

  function endPointer(e){
    if(!drawing) return;
    drawing = false;
    if(currentTool === 'rect'){
      const end = getPointFromEvent(e);
      const start = canvas._rectStart;
      const rect = { x: Math.min(start.x,end.x), y: Math.min(start.y,end.y), w: Math.abs(start.x-end.x), h: Math.abs(start.y-end.y) };
      const op = { id: genId(), type:'rect', userId: clientId, payload:{ rect, color: currentColor, width: currentSize } };
      applyOpToCanvas(op, true); try { WS.emit('op', { roomId, op }); } catch(e){}
      delete canvas._rectStart;
      return;
    }
    if(currentTool === 'text'){
      const txt = (document.getElementById('text-input')||{}).value || '';
      if(txt.trim()){
        const p = getPointFromEvent(e);
        const op = { id: genId(), type:'text', userId: clientId, payload:{ x:p.x,y:p.y,text:txt,color:currentColor,size:Math.max(12,currentSize*3) } };
        applyOpToCanvas(op, true); try { WS.emit('op', { roomId, op }); } catch(e){}
      }
      return;
    }
    if(currentTool === 'image') return;
    if(currentPath.length>0){
      const payload = { points: currentPath.slice(), color: currentColor, width: currentSize };
      const op = { id: genId(), type: currentTool === 'eraser' ? 'erase' : 'stroke', userId: clientId, payload };
      applyOpToCanvas(op, true); try { WS.emit('op', { roomId, op }); } catch(e){}
      currentPath = [];
    }
  }

  function flushPartial(){
    if(currentPath.length <= 1) return;
    const pts = currentPath.splice(0, currentPath.length-1);
    const op = { id: genId(), type: currentTool === 'eraser' ? 'erase' : 'stroke', userId: clientId, payload:{ points: pts, color: currentColor, width: currentSize } };
    applyOpToCanvas(op, true); try { WS.emit('op', { roomId, op }); } catch(e){}
  }

  // remote ops
  function applyRemoteOp(op){
    if(!op || !op.id) return;
    if(history.find(h=>h.id===op.id)) return;
    applyOpToCanvas(op, true);
  }

  // users/cursors
  function updateRemoteCursor(userId, data){
    cursors.set(userId, data);
    renderUserList();
  }

  function renderUserList(){
    const ul = document.getElementById('users');
    if(!ul) return;
    ul.innerHTML = '';
    if(cursors.size === 0){ ul.innerHTML = '<li style="color:#999">No users</li>'; return; }
    for(const [id, info] of cursors.entries()){
      const li = document.createElement('li');
      const dot = document.createElement('span'); dot.className='user-dot'; dot.style.background = info.color || '#888';
      const label = document.createElement('span'); label.textContent = info.name || id.slice(0,6);
      li.appendChild(dot); li.appendChild(label);
      li.addEventListener('click', (ev) => { ev.stopPropagation(); showUserCard(id, info, li); });
      ul.appendChild(li);
    }
  }

  function showUserCard(id, info, anchor){
    const prev = document.getElementById('user-info-card'); if(prev) prev.remove();
    const c = document.createElement('div'); c.id='user-info-card'; c.style.position='absolute'; c.style.zIndex=9999;
    c.style.padding='10px'; c.style.background='#fff'; c.style.boxShadow='0 6px 18px rgba(0,0,0,0.12)'; c.style.border='1px solid rgba(0,0,0,0.06)';
    c.innerHTML = `<div style="font-weight:700">${info.name||id}</div><div style="font-size:12px;opacity:.8">ID: ${id}</div>
      <div style="margin-top:6px">Color: <span style="display:inline-block;width:14px;height:14px;background:${info.color||'#888'};vertical-align:middle;border-radius:3px"></span></div>
      <div style="margin-top:8px"><button id="close-card">Close</button></div>`;
    document.body.appendChild(c);
    const a = anchor.getBoundingClientRect(), r = c.getBoundingClientRect();
    let left = window.scrollX + a.right + 8; let top = window.scrollY + a.top;
    if(left + r.width > window.scrollX + window.innerWidth) left = window.scrollX + a.left - r.width - 8;
    if(top + r.height > window.scrollY + window.innerHeight) top = window.scrollY + window.innerHeight - r.height - 8;
    c.style.left = left + 'px'; c.style.top = top + 'px';
    document.getElementById('close-card').addEventListener('click', ()=> c.remove());
    setTimeout(()=> {
      const handler = (ev)=>{ if(!c.contains(ev.target) && !anchor.contains(ev.target)){ c.remove(); document.removeEventListener('click', handler); } };
      document.addEventListener('click', handler);
    }, 10);
  }

  // attach listeners
  function attach(){
    canvas.addEventListener('mousedown', startPointer);
    window.addEventListener('mousemove', movePointer);
    window.addEventListener('mouseup', endPointer);
    canvas.addEventListener('touchstart', startPointer, { passive:false });
    window.addEventListener('touchmove', movePointer, { passive:false });
    window.addEventListener('touchend', endPointer);

    // drag/drop images
    canvas.addEventListener('dragover', e=>e.preventDefault());
    canvas.addEventListener('drop', e=>{
      e.preventDefault();
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if(f && f.type.startsWith('image/')){
        const rdr = new FileReader();
        rdr.onload = (ev) => {
          const dataUrl = ev.target.result;
          const imgId = genId();
          const rect = canvas.getBoundingClientRect();
          const payload = { id: imgId, x: rect.width/4, y: rect.height/4, w: rect.width/2, h: rect.height/2, dataUrl };
          const op = { id: genId(), type:'image', userId: clientId, payload };
          applyOpToCanvas(op, true); try { WS.emit('op', { roomId, op }); } catch(e){}
        };
        rdr.readAsDataURL(f);
      }
    });
  }

  // public API
  window.CanvasApp = {
    init: function(){ attach(); resizeCanvas(); },
    setTool: function(t){ currentTool = t; document.getElementById('text-input').style.display = t==='text' ? 'inline-block' : 'none'; document.getElementById('image-file').style.display = t==='image' ? 'inline-block' : 'none'; },
    setColor: function(c){ currentColor = c; },
    setSize: function(s){ currentSize = s; },
    applyRemoteOp,
    setClientId: function(id){ clientId = id; },
    updateCursor: updateRemoteCursor,
    requestUndo: function(){ try { WS.emit('undo_request', { roomId, userId: clientId }); } catch(e){} },
    requestRedo: function(){ try { WS.emit('redo_request', { roomId, userId: clientId }); } catch(e){} },
    rebuild: rebuildCanvasFromHistory,
    setRoomId: function(r){ roomId = r; }
  };

  // expose history pointer for load/save
  window.__CANVAS_INTERNAL = { historyRef: history, applyOpToCanvas };

  // utils
  function genId(){ return 'op_' + Math.random().toString(36).slice(2,10); }
  function debounce(fn,ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }

})();

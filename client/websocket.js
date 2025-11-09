// websocket.js - small safe wrapper around socket.io client
(function(){
  console.log('[WS] websocket.js loaded. typeof io =', typeof io);
  if(typeof io === 'undefined'){
    console.error('[WS] socket.io client (io) is undefined. Ensure /socket.io/socket.io.js is served and loaded before websocket.js');
    window.WS = null;
    return;
  }

  const WS = (function(){
    let socket = null, room = null;

    function safeClose(s){
      try{
        if(!s) return;
        if(s.removeAllListeners) s.removeAllListeners();
        if(s.disconnect) s.disconnect();
      }catch(e){ console.warn('[WS] safeClose', e); }
    }

    function connect(roomId = 'main'){
      if(socket && socket.connected && room === roomId) return socket;
      if(socket){ safeClose(socket); socket = null; }
      room = roomId;
      // call without explicit path - default
      socket = io({ query: { roomId: roomId }, transports: ['websocket','polling'] });
      socket.on('connect', ()=> console.log('[WS] connected', socket.id, 'room=', room));
      socket.on('connect_error', e => console.warn('[WS] connect_error', e && e.message));
      socket.on('disconnect', (r) => console.log('[WS] disconnected', r));
      return socket;
    }

    function on(event, cb){ if(!socket) console.warn('[WS] on called before connect for', event); if(socket) socket.on(event, cb); }
    function off(event, cb){ if(socket){ if(cb) socket.off(event, cb); else socket.removeAllListeners(event); } }
    function emit(event, data, ack){
      if(!socket || !socket.connected){
        // safe warning - don't throw; socket.io will queue if needed
        console.warn('[WS] emit queued because not connected:', event);
        if(socket && socket.emitBuffered) socket.emit(event, data, ack);
        return;
      }
      socket.emit(event, data, ack);
    }
    function id(){ return socket ? socket.id : null; }
    function disconnect(){ safeClose(socket); socket = null; room = null; }
    return { connect, on, off, emit, id, disconnect };
  })();

  window.WS = WS;
  console.log('[WS] wrapper installed');
})();

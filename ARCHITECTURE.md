#  ARCHITECTURE.md — Collaborative Canvas

This file explains the internal architecture and logic of the **Collaborative Canvas** project.  
It’s written in a structured, developer-style format to show how the system is designed and implemented.

---

##  System Overview

```js
// Collaborative Canvas - System Architecture Overview
// ------------------------------------------------------
// The app follows a Client-Server model using Socket.IO
// for real-time communication.
//
// • Clients connect via WebSocket and join a specific "room".
// • Each user action (draw, erase, text, image) creates an "op".
// • The server receives and rebroadcasts these ops to all users.
// • The canvas rebuilds based on shared operation history.
//
// Result: All connected users see the same canvas in sync.

 ┌─────────────────────────┐
 │        User Action      │
 │ (Draw / Erase / Shape)  │
 └────────────┬────────────┘
              │
              ▼
 ┌─────────────────────────┐
 │   CanvasApp (Client)    │
 │  - Captures operation   │
 │  - Sends via WebSocket  │
 └────────────┬────────────┘
              │
              ▼
 ┌─────────────────────────┐
 │     Socket.IO Server    │
 │  - Receives operations  │
 │  - Updates room history │
 │  - Broadcasts to all    │
 └────────────┬────────────┘
              │
              ▼
 ┌─────────────────────────┐
 │   Other Connected Users │
 │  - Receive operations   │
 │  - Re-render drawings   │
 └─────────────────────────┘

/*
1️⃣ server/server.js
   - Sets up Express and Socket.IO.
   - Handles room creation, save/load endpoints.
   - Broadcasts drawing ops to all connected clients.

2️⃣ server/rooms.js
   - Tracks users in each room.
   - Handles join and disconnect events.
   - Maintains the online users list.

3️⃣ server/drawing-state.js
   - Stores all drawing operations for each room.
   - Provides undo/redo support.
   - Handles saving and loading history files.

4️⃣ client/canvas.js
   - Handles drawing, erasing, text, and image rendering.
   - Maintains local operation history.
   - Applies received operations from the server.

5️⃣ client/main.js
   - Connects user interface controls to the canvas.
   - Handles tool selection, room join, and save/load buttons.
   - Synchronizes with WebSocket wrapper.

6️⃣ client/websocket.js
   - Provides safe, reusable Socket.IO connection logic.
   - Defines emit/on functions for all events.
*/

// OUTGOING EVENTS (Client → Server)
'op'           → Send new draw/erase operation
'cursor'       → Broadcast cursor position
'undo_request' → Ask for undo
'redo_request' → Ask for redo
'ping_ts'      → Check latency

// INCOMING EVENTS (Server → Client)
'state_init'     → Receive full room history
'op_broadcast'   → Receive a new operation
'cursor'         → Get another user's cursor update
'undo_broadcast' → Undo event broadcast
'redo_broadcast' → Redo event broadcast
'user_update'    → Updated user list
'saved_session'  → Session saved confirmation

// Each operation (op) is stored in a history array.
// Undo/Redo work by marking or restoring specific ops.

/*
Structure of an operation:
{
  id: "op_123xyz",
  type: "stroke" | "erase" | "rect" | "text" | "image",
  userId: "socketId",
  payload: { ...details... },
  serverTs: timestamp
}

Undo Flow:
1. Find the last active operation.
2. Mark it as _undone = true.
3. Rebuild canvas without it.
4. Emit 'undo_broadcast' to all clients.

Redo Flow:
1. Find last undone operation.
2. Remove the _undone flag.
3. Emit 'redo_broadcast' to reapply it.
*/

// Operations are stored in /persist as JSON files.
// Example: persist/history-main.json
[
  { id: "op_abc12", type: "stroke", userId: "A", payload: {...} },
  { id: "op_def34", type: "erase", userId: "B", payload: {...} }
]

// Save Flow:
1. Client sends POST /save { roomId }
2. Server writes history to JSON file
3. Emits 'saved_session' event

// Load Flow:
1. Client calls GET /load?roomId=main
2. Server reads saved file
3. Sends data back
4. Canvas rebuilds from history

Operation Data Structure:

const op = {
  id: "op_123xyz",
  type: "stroke",
  userId: "socket_123",
  payload: {
    points: [ { x: 100, y: 200 }, { x: 120, y: 210 } ],
    color: "#000000",
    width: 4
  },
  serverTs: 1731043200000
};


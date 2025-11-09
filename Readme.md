# 🎨 Collaborative Canvas — Real-Time Drawing App

A real-time collaborative drawing application where multiple users can draw, erase, undo, and redo together on a shared canvas.  
Built using Node.js, Express.js, Socket.IO, and HTML5 Canvas to demonstrate real-time synchronization between clients using WebSockets.

## Project Overview
The Collaborative Canvas allows users to:
- Draw freely with adjustable brush size and color
- Erase or undo mistakes
- Add text or images
- Save and load previous sessions
- Collaborate in real-time with other users in the same room

Each user’s actions are instantly broadcast to all connected users in the same room.

## Tech Stack
Frontend: HTML5, CSS3, JavaScript  
Backend: Node.js, Express.js  
Real-Time: Socket.IO  
Rendering: HTML5 Canvas API  
Storage: JSON file-based persistence (persist folder)

## Features Implemented
- Real-time drawing and erasing
- Multiple users can join the same room
- Undo and Redo with global synchronization
- Save and Load drawings (persisted in local JSON files)
- Real-time user tracking and online status
- Latency, FPS, and operations metrics displayed on UI
- Text and image insertion tools
- Responsive interface with modern layout

## Setup Instructions
1. Clone the repository  
   `git clone https://github.com/your-username/collaborative-canvas.git`  
   `cd collaborative-canvas`
2. Install dependencies  
   `npm install`
3. Start the server  
   `npm start`
4. Open in browser  
   Go to `http://localhost:3000` to start using the app.

## How to Test
### Single User
1. Open the app at http://localhost:3000  
2. Use the brush and eraser tools to draw and test undo/redo.  
3. Click “Save” to store your work, then “Load” to restore it.

### Multiple Users
1. Open two or more browser tabs or devices.  
2. Enter the same Room ID (for example: main) and click Join.  
3. Start drawing in one tab; the same drawing appears in all other tabs.  
4. Undo and Redo actions are reflected instantly across all clients.

## Project Structure
<img width="672" height="452" alt="image" src="https://github.com/user-attachments/assets/3cb45780-7307-4e12-9a4b-e7a9a2c880f3" />


## Known Limitations / Bugs
- Undo and Redo affect all users globally instead of individually.
- No user authentication or role management implemented.
- File-based JSON persistence not optimized for heavy concurrent sessions.
- Slight lag may occur with very large drawings.
- Mobile gestures may behave differently depending on browser.

## Time Spent on Project
| Phase | Task | Time |
|--------|------|------|
| Planning & Architecture | Designed overall system and data flow | 2 hrs |
| Core Implementation | Built canvas logic and Socket.IO events | 4 hrs |
| Undo/Redo | History system and replay logic | 2 hrs |
| Save/Load Persistence | File-based save and restore | 1.5 hrs |
| UI Design | Layout, controls, responsive styles | 1.5 hrs |
| Testing & Debugging | Multi-user testing, bug fixes | 2 hrs |
| **Total Time Spent** |  | **~13 hrs** |

## How the App Works
1. User draws or erases → creates an operation object  
2. Operation is sent to the server using Socket.IO  
3. Server broadcasts to all connected clients in the same room  
4. Clients update their canvases in real time using the received data  
5. All users see the same synchronized drawing state

## WebSocket Events
### Client → Server
- op — send drawing operation  
- cursor — send live cursor position  
- undo_request — request undo action  
- redo_request — request redo action  
- ping_ts — latency measurement  

### Server → Client
- op_broadcast — broadcast a new operation  
- cursor — update other users’ cursor  
- state_init — send complete room history  
- undo_broadcast — apply undo globally  
- redo_broadcast — apply redo globally  
- user_update — update connected users list  
- saved_session — notify session saved

## Summary
The Collaborative Canvas merges real-time communication, synchronized drawing operations, and lightweight file persistence to enable multiple users to draw together in a shared workspace. It’s a simple yet complete implementation of collaborative real-time graphics using Socket.IO and HTML5 Canvas.

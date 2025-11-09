// server/rooms.js
class Rooms {
  constructor(){
    this._rooms = new Map(); // roomId -> Map(userId -> user)
  }

  hasRoom(roomId){
    return this._rooms.has(roomId);
  }

  createRoom(roomId){
    if(!this._rooms.has(roomId)) this._rooms.set(roomId, new Map());
  }

  addUser(roomId, user){
    this.createRoom(roomId);
    this._rooms.get(roomId).set(user.id, user);
  }

  removeUser(roomId, userId){
    if(!this._rooms.has(roomId)) return;
    this._rooms.get(roomId).delete(userId);
  }

  getUsers(roomId){
    const map = this._rooms.get(roomId);
    if(!map) return {};
    const out = {};
    for(const [id,u] of map.entries()) out[id] = u;
    return out;
  }
}

module.exports = Rooms;

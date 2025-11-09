// server/drawing-state.js
class DrawingState {
  constructor(){
    this._history = []; // array of ops
  }

  getHistory(){ return this._history; }

  loadHistory(arr){
    if(!Array.isArray(arr)) return;
    this._history.length = 0;
    for(const op of arr) this._history.push(op);
  }

  appendOp(op){
    if(!op || !op.id) throw new Error('invalid op');
    this._history.push(op);
  }

  findLastUndoable(){
    // find last op that is not undone and is a user-op (stroke/erase/rect/image/text)
    for(let i=this._history.length-1;i>=0;i--){
      const op = this._history[i];
      if(op._undone) continue;
      if(['stroke','erase','rect','image','text'].includes(op.type)) return op;
    }
    return null;
  }

  findLastUndone(){
    // find last undone op to redo
    for(let i=this._history.length-1;i>=0;i--){
      const op = this._history[i];
      if(op._undone) return op;
    }
    return null;
  }

  markUndone(id){
    const op = this._history.find(o=>o.id===id);
    if(op) op._undone = true;
  }

  markRedone(id){
    const op = this._history.find(o=>o.id===id);
    if(op) delete op._undone;
  }
}

module.exports = DrawingState;

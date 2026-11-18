const _E = () => ({style:{}, classList:{add(){},remove(){},toggle(){}}, dataset:{}, innerHTML:"", textContent:"", value:"", className:"", disabled:false, addEventListener(){}, appendChild(){}, click(){}, closest(){return null}, querySelectorAll(){return []}});
global._lastHTML = {};
global.document = {getElementById:(id)=>{ if(!_lastHTML[id]) _lastHTML[id]=_E(); return _lastHTML[id]; }, querySelectorAll:()=>[], querySelector:()=>_E(), body:{insertAdjacentHTML(){}}, createElement:()=>_E(), addEventListener(){}};
global.indexedDB = {open(){ throw new Error("idb off"); }};
global.URL = {createObjectURL:()=>"", revokeObjectURL(){}};
global.confirm = () => true;
global.localStorage = { getItem(){ return null; }, setItem(){} };

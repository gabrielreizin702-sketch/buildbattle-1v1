import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const socket = io();
const $ = id => document.getElementById(id);
let scene, camera, renderer, clock, localMesh, remoteMesh, remoteId = null;
let playerId = "", yaw = 0, pitch = 0, velocityY = 0, onGround = true, started = false;
const buildData = new Map();
const builds = new Map();
const keys = {};
let lastMoveSend = 0, toastTimer;
const raycaster = new THREE.Raycaster();
const mats = {
  ground: new THREE.MeshStandardMaterial({color:0x315c84, roughness:.9}),
  wall: new THREE.MeshStandardMaterial({color:0x38a8e8, transparent:true, opacity:.78}),
  floor: new THREE.MeshStandardMaterial({color:0x49d9bd, transparent:true, opacity:.82})
};

$("createBtn").onclick = () => {
  const name = $("playerName").value.trim() || "Jogador";
  socket.emit("createRoom", {name}, result => {
    if (!result.ok) return message(result.error);
    enterGame(result.code, result.playerId);
  });
};
$("joinBtn").onclick = () => {
  const name = $("playerName").value.trim() || "Jogador";
  socket.emit("joinRoom", {code:$("roomCode").value, name}, result => {
    if (!result.ok) return message(result.error);
    enterGame(result.code, result.playerId);
  });
};
function message(t){$("lobbyMsg").textContent=t}
function enterGame(code,id){
  playerId=id;
  $("lobby").classList.add("hidden"); $("game").classList.remove("hidden");
  $("roomLabel").textContent="SALA "+code;
  $("status").textContent="Compartilhe o código: "+code;
  started=true; init3D();
  toast("Sala criada! Envie o código "+code+" para seu amigo.");
}
function toast(t){
  $("toast").textContent=t; $("toast").style.display="block";
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>$("toast").style.display="none",3000);
}
function init3D(){
  scene=new THREE.Scene(); scene.background=new THREE.Color(0x78bce9); scene.fog=new THREE.Fog(0x78bce9,45,115);
  camera=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,.1,180);
  renderer=new THREE.WebGLRenderer({antialias:true}); renderer.setSize(innerWidth,innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.shadowMap.enabled=true;
  $("game").appendChild(renderer.domElement);
  clock=new THREE.Clock();
  scene.add(new THREE.HemisphereLight(0xdaf2ff,0x36506c,2));
  const sun=new THREE.DirectionalLight(0xffffff,2.2); sun.position.set(-20,35,15); sun.castShadow=true; scene.add(sun);
  const floor=new THREE.Mesh(new THREE.BoxGeometry(100,1,100),mats.ground); floor.position.y=-.55; floor.receiveShadow=true; scene.add(floor);
  const grid=new THREE.GridHelper(100,50,0x78b9e7,0x477da7); grid.position.y=-.04; scene.add(grid);
  for(let i=-1;i<=1;i+=2){
    const rail=new THREE.Mesh(new THREE.BoxGeometry(100,1.2,.7),new THREE.MeshStandardMaterial({color:0x163e68}));
    rail.position.set(0,.1,i*50);scene.add(rail);
    const side=new THREE.Mesh(new THREE.BoxGeometry(.7,1.2,100),rail.material);side.position.set(i*50,.1,0);scene.add(side);
  }
  for(let i=0;i<24;i++){
    const h=4+Math.random()*12, rock=new THREE.Mesh(new THREE.DodecahedronGeometry(2+Math.random()*3,0),new THREE.MeshStandardMaterial({color:0x5489ae,flatShading:true}));
    rock.position.set((Math.random()-.5)*130, h/2-3, (Math.random()-.5)*130); scene.add(rock);
  }
  localMesh=makePlayer(0x20c8ff); scene.add(localMesh);
  window.addEventListener("resize",resize);
  renderer.domElement.addEventListener("click",()=>{if(!document.pointerLockElement)renderer.domElement.requestPointerLock();});
  document.addEventListener("mousemove",e=>{if(document.pointerLockElement===renderer.domElement){yaw-=e.movementX*.0022;pitch-=e.movementY*.0022;pitch=Math.max(-1.35,Math.min(1.35,pitch));}});
  document.addEventListener("keydown",e=>{
    keys[e.code]=true;
    if(["Space","ArrowUp","ArrowDown"].includes(e.code))e.preventDefault();
    if(e.repeat)return;
    if(e.code==="KeyQ")placeBuild("wall");
    if(e.code==="KeyE")placeBuild("ramp");
    if(e.code==="KeyF")placeBuild("floor");
  });
  document.addEventListener("keyup",e=>keys[e.code]=false);
  document.addEventListener("mousedown",e=>{if(e.button===0&&document.pointerLockElement===renderer.domElement)shoot();});
  animate();
}
function makePlayer(color){
  const group=new THREE.Group();
  const body=new THREE.Mesh(new THREE.BoxGeometry(.8,1.25,.48),new THREE.MeshStandardMaterial({color,roughness:.6}));
  body.position.y=.05;body.castShadow=true;group.add(body);
  const head=new THREE.Mesh(new THREE.BoxGeometry(.48,.48,.48),new THREE.MeshStandardMaterial({color:0xf1c99d}));head.position.y=.95;head.castShadow=true;group.add(head);
  const visor=new THREE.Mesh(new THREE.BoxGeometry(.5,.12,.5),new THREE.MeshStandardMaterial({color:0x102d49,metalness:.3}));visor.position.set(0,1.02,-.02);group.add(visor);
  return group;
}
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}
function animate(){
  if(!started)return;
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.04);
  updatePlayer(dt);
  camera.position.set(localMesh.position.x,localMesh.position.y+1.45,localMesh.position.z);
  camera.rotation.order="YXZ";camera.rotation.set(pitch,yaw,0);
  renderer.render(scene,camera);
}
function updatePlayer(dt){
  const forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
  const right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
  const move=new THREE.Vector3();
  if(keys.KeyW)move.add(forward);if(keys.KeyS)move.sub(forward);
  if(keys.KeyD)move.add(right);if(keys.KeyA)move.sub(right);
  if(move.lengthSq())move.normalize().multiplyScalar((keys.ShiftLeft?11:7)*dt);
  const previous=localMesh.position.clone();
  localMesh.position.add(move);
  for(const piece of buildData.values()){
    if(piece.type!=="wall")continue;
    const dx=localMesh.position.x-piece.x,dz=localMesh.position.z-piece.z;
    const c=Math.cos(piece.rot||0),s=Math.sin(piece.rot||0);
    const lx=dx*c-dz*s,lz=dx*s+dz*c;
    if(Math.abs(lx)<2.45&&Math.abs(lz)<.72&&localMesh.position.y<3.2){
      localMesh.position.x=previous.x;localMesh.position.z=previous.z;break;
    }
  }
  if(keys.Space&&onGround){velocityY=8;onGround=false;}
  velocityY-=22*dt;localMesh.position.y+=velocityY*dt;
  if(localMesh.position.y<0){localMesh.position.y=0;velocityY=0;onGround=true;}
  localMesh.position.x=THREE.MathUtils.clamp(localMesh.position.x,-48,48);
  localMesh.position.z=THREE.MathUtils.clamp(localMesh.position.z,-48,48);
  localMesh.rotation.y=yaw;
  const now=performance.now();
  if(now-lastMoveSend>50){
    socket.emit("move",{x:localMesh.position.x,y:localMesh.position.y+1,z:localMesh.position.z,rot:yaw});lastMoveSend=now;
  }
}
function placeBuild(type){
  const dir=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
  const pos=localMesh.position.clone().add(dir.multiplyScalar(3));
  pos.x=Math.round(pos.x/2)*2;pos.z=Math.round(pos.z/2)*2;
  socket.emit("build",{type,x:pos.x,y:type==="floor"?1:1.6,z:pos.z,rot:yaw});
}
function addBuild(p){
  if(builds.has(p.id))return;
  buildData.set(p.id,p);
  let mesh;
  if(p.type==="wall"){
    mesh=new THREE.Mesh(new THREE.BoxGeometry(4,3.2,.28),mats.wall);mesh.position.set(p.x,p.y,p.z);mesh.rotation.y=p.rot;
  }else if(p.type==="floor"){
    mesh=new THREE.Mesh(new THREE.BoxGeometry(4,.22,4),mats.floor);mesh.position.set(p.x,p.y,p.z);mesh.rotation.y=p.rot;
  }else{
    const geo=new THREE.BufferGeometry();
    const vertices=new Float32Array([-2,0,2,2,0,2,-2,2.8,-2,2,0,2,2,2.8,-2,-2,2.8,-2]);
    geo.setAttribute("position",new THREE.BufferAttribute(vertices,3));geo.computeVertexNormals();
    mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:0xf2b84b,side:THREE.DoubleSide}));mesh.position.set(p.x,p.y,p.z);mesh.rotation.y=p.rot;
  }
  mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);builds.set(p.id,mesh);
}
function shoot(){
  raycaster.setFromCamera(new THREE.Vector2(0,0),camera);
  if(!remoteMesh||!remoteId)return;
  const direction=raycaster.ray.direction.clone().normalize();
  const origin=camera.position.clone();
  socket.emit("shoot",{targetId:remoteId,origin:{x:origin.x,y:origin.y,z:origin.z},direction:{x:direction.x,y:direction.y,z:direction.z}});
}
function updateHealth(id,hp){
  if(id===playerId){$("myHp").textContent=hp+" HP";$("myHealth").style.width=hp+"%";}
  else{$("enemyHp").textContent=hp+" HP";$("enemyHealth").style.width=hp+"%";}
}
socket.on("roomState",state=>{
  if(!started)return;
  const opponent=state.players.find(p=>p.id!==playerId);
  if(opponent){
    remoteId=opponent.id;
    if(!remoteMesh){remoteMesh=makePlayer(0xffa53d);scene.add(remoteMesh);}
    remoteMesh.position.set(opponent.x,Math.max(0,opponent.y-1),opponent.z);
    $("status").textContent="Adversário conectado: "+opponent.name;
    updateHealth(playerId,100);updateHealth(remoteId,opponent.hp);
  }else{$("status").textContent="Aguardando seu amigo entrar...";}
  state.builds.forEach(addBuild);
});
socket.on("opponentMove",p=>{if(p.id!==remoteId||!remoteMesh)return;remoteMesh.position.set(p.x,Math.max(0,p.y-1),p.z);remoteMesh.rotation.y=p.rot||0;});
socket.on("built",addBuild);
socket.on("health",d=>updateHealth(d.id,d.hp));
socket.on("notice",toast);
socket.on("opponentLeft",()=>{remoteId=null;if(remoteMesh){scene.remove(remoteMesh);remoteMesh=null;}$("status").textContent="O adversário saiu. Aguardando outro jogador...";toast("Seu amigo saiu da sala.");});
socket.on("roundOver",d=>{$("roundText").textContent=d.winner+" VENCEU!";$("roundModal").classList.remove("hidden");document.exitPointerLock?.();});
socket.on("resetRound",state=>{
  builds.forEach(m=>scene.remove(m));builds.clear();buildData.clear();
  localMesh.position.set(0,0,playerId===state.players[0]?.id?8:-8);
  $("roundModal").classList.add("hidden");updateHealth(playerId,100);
  const opponent=state.players.find(p=>p.id!==playerId);
  if(opponent){remoteId=opponent.id;updateHealth(remoteId,100);}
  state.builds.forEach(addBuild);toast("Nova rodada!");
});
$("restartBtn").onclick=()=>socket.emit("restartRound");
$("exitBtn").onclick=()=>location.reload();
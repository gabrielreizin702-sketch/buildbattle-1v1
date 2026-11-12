import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const socket = io();
const $ = id => document.getElementById(id);
let scene, camera, renderer, clock, localMesh, remoteMesh, remoteId = null;
let playerId = "", yaw = 0, pitch = 0, velocityY = 0, onGround = true, started = false, weaponIndex = 0, lastShotAt = 0;
const weapons=[{name:"RIFLE",damage:18,delay:140,range:75,color:0xffe08a},{name:"SHOTGUN",damage:9,delay:650,range:32,color:0xffa45c}];
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
  camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.1,220);
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
  localMesh=makePlayer(0x20c8ff,true); scene.add(localMesh);
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
  document.addEventListener("keydown",e=>{if(e.repeat)return;if(e.code==="Digit1")selectWeapon(0);if(e.code==="Digit2")selectWeapon(1);});
  selectWeapon(0);
  animate();
}
function makePlayer(color,isLocal=false){
 const group=new THREE.Group(),suit=new THREE.MeshStandardMaterial({color,roughness:.72}),dark=new THREE.MeshStandardMaterial({color:0x172638,roughness:.55}),skin=new THREE.MeshStandardMaterial({color:0xd9a77d,roughness:.8});
 const torso=new THREE.Mesh(new THREE.BoxGeometry(.78,.92,.42),suit);torso.position.y=1.18;torso.castShadow=true;group.add(torso);
 const vest=new THREE.Mesh(new THREE.BoxGeometry(.82,.48,.45),dark);vest.position.set(0,1.2,-.015);group.add(vest);
 const head=new THREE.Mesh(new THREE.SphereGeometry(.25,16,12),skin);head.position.y=1.88;head.castShadow=true;group.add(head);
 const helmet=new THREE.Mesh(new THREE.SphereGeometry(.27,16,10,0,Math.PI*2,0,Math.PI*.58),dark);helmet.position.y=1.96;group.add(helmet);
 const legPivots=[];
 for(const x of [-.23,.23]){const leg=new THREE.Group();leg.position.set(x,.78,0);const thigh=new THREE.Mesh(new THREE.BoxGeometry(.25,.52,.28),dark);thigh.position.y=-.26;thigh.castShadow=true;leg.add(thigh);const boot=new THREE.Mesh(new THREE.BoxGeometry(.27,.18,.4),suit);boot.position.set(0,-.52,-.055);leg.add(boot);group.add(leg);legPivots.push(leg);}
 const armPivots=[];
 for(const x of [-.48,.48]){const arm=new THREE.Group();arm.position.set(x,1.48,0);const upper=new THREE.Mesh(new THREE.BoxGeometry(.22,.55,.24),suit);upper.position.y=-.23;upper.castShadow=true;arm.add(upper);group.add(arm);armPivots.push(arm);}
 const gun=new THREE.Group(),metal=new THREE.MeshStandardMaterial({color:0x273746,metalness:.72,roughness:.3});
 const receiver=new THREE.Mesh(new THREE.BoxGeometry(.16,.17,.72),metal);receiver.position.z=-.28;gun.add(receiver);
 const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.48,10),metal);barrel.rotation.x=Math.PI/2;barrel.position.set(0,.015,-.82);gun.add(barrel);
 const stock=new THREE.Mesh(new THREE.BoxGeometry(.13,.14,.28),dark);stock.position.z=.2;gun.add(stock);gun.position.set(.03,1.37,-.42);group.add(gun);
 const muzzle=new THREE.PointLight(0xffc36a,0,5);muzzle.position.set(0,.02,-1.02);gun.add(muzzle);
 group.userData={legPivots,armPivots,gun,muzzle,walk:0,isLocal};return group;
}
function selectWeapon(index){weaponIndex=index;const w=weapons[index];const label=$("weaponName");if(label)label.textContent=w.name;const info=$("weaponInfo");if(info)info.textContent=index===0?"AUTOMÁTICO • 18 DANO":"DISPERSÃO • 9 DANO";toast("Arma equipada: "+w.name);}
function showTracer(from,to,color=0xffe08a){
 const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(from.x,from.y,from.z),new THREE.Vector3(to.x,to.y,to.z)]);
 const line=new THREE.Line(geo,new THREE.LineBasicMaterial({color,transparent:true,opacity:.95}));scene.add(line);
 setTimeout(()=>{scene.remove(line);geo.dispose();line.material.dispose();},100);
}
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}
function animate(){
  if(!started)return;
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.04);
  updatePlayer(dt);
  const forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
  camera.position.copy(localMesh.position).add(new THREE.Vector3(Math.sin(yaw)*5.2,2.65,Math.cos(yaw)*5.2));
  const aimPoint=localMesh.position.clone().add(new THREE.Vector3(0,1.55,0)).add(forward.clone().multiplyScalar(24*Math.cos(pitch))).add(new THREE.Vector3(0,24*Math.sin(pitch),0));camera.lookAt(aimPoint);
  renderer.render(scene,camera);
}
function updatePlayer(dt){
  const forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
  const right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
  const move=new THREE.Vector3();
  if(keys.KeyW)move.add(forward);if(keys.KeyS)move.sub(forward);
  if(keys.KeyD)move.add(right);if(keys.KeyA)move.sub(right);
  if(move.lengthSq())move.normalize().multiplyScalar((keys.ShiftLeft?9:6)*dt);
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
  const moving=move.lengthSq()>0.0001;localMesh.userData.walk+=dt*(moving?11:2);const swing=moving?Math.sin(localMesh.userData.walk)*.62:0;
  localMesh.userData.legPivots[0].rotation.x=swing;localMesh.userData.legPivots[1].rotation.x=-swing;localMesh.userData.armPivots[0].rotation.x=-.48;localMesh.userData.armPivots[1].rotation.x=-.72;
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
 const weapon=weapons[weaponIndex],now=performance.now();if(now-lastShotAt<weapon.delay)return;lastShotAt=now;
 const origin=camera.position.clone(),dir=new THREE.Vector3(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)).normalize();
 const spread=weaponIndex===1?.055:.006,pellets=weaponIndex===1?8:1;
 for(let i=0;i<pellets;i++){
  const shotDir=dir.clone().add(new THREE.Vector3((Math.random()-.5)*spread,(Math.random()-.5)*spread,(Math.random()-.5)*spread)).normalize();
  let hit=origin.clone().add(shotDir.clone().multiplyScalar(weapon.range));
  if(remoteMesh){const center=new THREE.Vector3(remoteMesh.position.x,remoteMesh.position.y+1.05,remoteMesh.position.z),along=center.clone().sub(origin).dot(shotDir),closest=origin.clone().add(shotDir.clone().multiplyScalar(Math.max(0,along)));
   if(along>0&&along<weapon.range&&closest.distanceTo(center)<(weaponIndex===1?1.25:.72)){
    socket.emit("shoot",{targetId:remoteId,origin:{x:origin.x,y:origin.y,z:origin.z},direction:{x:shotDir.x,y:shotDir.y,z:shotDir.z},weapon:weaponIndex});hit.copy(center);
   }
  }
  showTracer({x:origin.x,y:origin.y,z:origin.z},{x:hit.x,y:hit.y,z:hit.z},weapon.color);
 }
 if(localMesh.userData.muzzle){localMesh.userData.muzzle.intensity=2;setTimeout(()=>{if(localMesh?.userData.muzzle)localMesh.userData.muzzle.intensity=0;},55);}
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
    if(!remoteMesh){remoteMesh=makePlayer(0xffa53d,false);scene.add(remoteMesh);}
    remoteMesh.position.set(opponent.x,Math.max(0,opponent.y-1),opponent.z);
    $("status").textContent="Adversário conectado: "+opponent.name;
    updateHealth(playerId,100);updateHealth(remoteId,opponent.hp);
  }else{$("status").textContent="Aguardando seu amigo entrar...";}
  state.builds.forEach(addBuild);
});
socket.on("opponentMove",p=>{if(p.id!==remoteId||!remoteMesh)return;remoteMesh.position.set(p.x,Math.max(0,p.y-1),p.z);remoteMesh.rotation.y=p.rot||0;});
socket.on("shotFx",d=>showTracer(d.from,d.to,d.color||0xffe08a));
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
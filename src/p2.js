
/* ---------- world state ---------- */
let enemies=[],tracers=[],flashes=[],shards=[],nades=[],bangs=[],pulses=[],kills=0,simT=0,paused=false,logs=[],structName='',roomsTotal=0,compromised=false;
const team={ops:[],state:'plan',stateT:0,t:0,events:[],room:null,geo:null,slots:null,door:null,clearing:false,holdT:0,secureT:0,entryT:0,
  frontier:[],coverT:0,engT:0,fireLogT:0,lastRoom:null};
/* test hook: a headless harness can set globalThis.__KH = {ev(name,data)} to observe decisions; nothing is sent otherwise */
const HOOK=(name,data)=>{const h=globalThis.__KH;if(h)h.ev(name,data);};
function setState(s){HOOK('state',{from:team.state,to:s});team.state=s;team.stateT=0;}

function clock(){const d=new Date();return pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());}
function comms(who,text,cls=''){logs.push({t:clock(),who:String(who),text,cls});if(logs.length>7)logs.shift();logDirty=true;}
function say(op,text,log){op.say=text;op.sayT=0;if(log)comms(op.id,text,log===true?'':log);if(op.id)noise(op.x,op.z,4.5);} // a voice carries
function at(dt,fn){team.events.push({t:team.t+dt,fn});}
/* shoulder tap: the support hand leaves the handguard and lands on the next man's shoulder.
   Silent until the team is compromised, then the verbal "UP" goes with it. */
function tap(from,to,text){
  if(!from||!to)return false;
  const d=Math.hypot(from.x-to.x,from.z-to.z);
  if(floorOf(from.x)!==floorOf(to.x)||d>1.7||from.aim){if(text&&compromised)say(from,text);return false;}
  if(d>0.95){ // out of arm's reach: close up behind him first (the squeeze), then the tap
    const ux=(from.x-to.x)/d,uz=(from.z-to.z)/d,p=[to.x+ux*0.72,to.z+uz*0.72];
    let mv=false;if(!from.wp.length&&teamAllowed(tileIdx(p[0],p[1]))){goTo(from,p[0],p[1],1.1);from.delay=0;mv=true;}
    from.tapPend={to,text,t:0,mv};return true;}
  from.tap={to,t:0,T:0.55,pulsed:false};HOOK('tap',{from,to});if(text&&compromised)say(from,text);return true;
}
const curFloor=()=>floorOf(team.ops[0].x);
const isRear=op=>team.ops.length>=3&&op.id===team.ops.length;
const TEAM_WORD=['','SOLO','TWO-MAN','THREE-MAN','FOUR-MAN'];

function newAgent(o){return Object.assign({vel:[0,0],yawV:0,pose:0.1,poseV:0,hi:0,hiV:0,tuck:0,tuckV:0,tuckT:0,wp:[],spd:1.4,body:null,seed:Math.random()*10},o);}
function spawnTeam(){
  const cx=pick([1.3,G.GW-1.3]),cz=pick([1.3,G.GH-1.3]),dx=cx<G.GW/2?1:-1;
  team.ops=Array.from({length:S.team},(_,i)=>i).map(i=>newAgent({id:i+1,x:clamp(cx-dx*i*0.8,0.6,G.GW-0.6),z:cz,h:Math.atan2(G.GH/2-cz,G.GW/2-cx),
    delay:0,face:null,aim:null,cover:null,look:null,pie:false,forceAim:false,blocked:false,low:false,teeHigh:false,
    flagT:0,moving:false,mh:0,waited:new Map(),say:null,sayT:0,fireCool:0,accel:6}));
}
function newEnemy(x,z,h,room){return newAgent({x,z,h,room,alive:true,eng:null,fireT:null,
  state:'idle',mode:'',spd:1.8,percT:Math.random()*0.1,tgt:null,fireCD:0,burst:ri(2,3),shootT:0,
  face:null,setT:0,alertT:0,peek:null,goal:null,pose:0.05,stunT:0,accel:5});}
function spawnEnemies(){
  const busy=team.room&&WORKING.includes(team.state)&&team.state!=='stacked'?team.room.id:-1;
  G.rooms.forEach(r=>{
    if(r.id<=1||r.cleared||r.id===busy)return;
    if(enemies.some(e=>e.alive&&e.room===r.id))return;
    const roll=Math.random();const n=roll<0.45?0:roll<0.84?1:2;
    const tiles=[];
    for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++){const i=y*G.TW+x;if(G.blocked[i]||G.rampOf[i]>=0)continue;
      const cx=x+0.5,cz=y+0.5;if(r.doorPts.some(p=>Math.hypot(p[0]-cx,p[1]-cz)<1.7))continue;
      if(team.ops.some(o=>Math.hypot(o.x-cx,o.z-cz)<1.5))continue;tiles.push([cx,cz,G.reserved[i]]);}
    const pref=tiles.filter(t=>!t[2]);const pool=pref.length?pref:tiles;
    for(let k=0;k<n&&pool.length;k++){const t=pool.splice(Math.floor(Math.random()*pool.length),1)[0];
      const dp=r.doorPts.length?pick(r.doorPts):[r.x+r.w/2,r.y+r.h/2];
      const ex=t[0]+rnd(-0.2,0.2),ez=t[1]+rnd(-0.2,0.2);
      const e=newEnemy(ex,ez,Math.atan2(dp[1]-ez,dp[0]-ex)+rnd(-0.4,0.4),r.id);enemies.push(e);
      if(compromised){e.state='alerted';e.alertT=rnd(1,3);e.fireCD=rnd(0.35,0.7);}}
  });
}
/* doors only move when someone works them: a request opens the door once a team member is within reach of it */
function openDoor(d,reach){if(d&&!d.breached)d.openReq=reach;}
function doorStep(dt){
  for(const d of G.doors){if(d.arch||d.stair)continue;
    if(d.openReq&&!d.breached){const who=team.ops.find(o=>floorOf(o.x)===floorOf(d.P[0])&&Math.hypot(o.x-d.P[0],o.z-d.P[1])<d.openReq);
      if(who||team.stateT>3){d.breached=true;d.openReq=0;if(who){who.reachT=0.35;who.reachP=d.P;}}}
    const want=(d.breached||d.eOpen||d.tOpen)?1:0;
    d.o+=(want-d.o)*Math.min(1,dt*(want?(d.slam?22:7):2));}
}
function removeLiveEnemies(){
  enemies.forEach(e=>{e.alive=false;e.eng=null;});enemies=[];
  team.ops.forEach(releaseAim);
}

/* ---------- team: state groups and shared helpers ---------- */
const wallName=(nx,nz)=>nx>0?'WEST':nx<0?'EAST':nz>0?'NORTH':'SOUTH';
/* team states, grouped */
const PRE=['stacked','breach','peek','pie','stun'];   // at the target door, nobody inside yet
const INSIDE=['entry','hold'];                         // flowing into / dominating the target room
const WORKING=[...PRE,...INSIDE];                      // anything done at or in the target room
const DIP_STATES=['entry','hold','breach','stun'];     // a teammate in the line: muzzle down, never a swing
const isHeld=r=>r.cleared||(team.room===r&&INSIDE.includes(team.state));
const DIP=-0.4; // muzzle-depressed carry used when a teammate is in the line
const SEEN_OK=0.92; // share of a room that must have been looked at before it is called clear

/* ---------- planning: danger areas, door geometry, stack positions ---------- */
/* danger areas: every doorway, archway or stairhead between space the team holds and space it does not */
function frontierDoors(){
  const out=[];
  for(const d of G.doors){
    const r1=G.rooms[G.rid[d.i1]],r2=G.rooms[G.rid[d.i2]],h1=isHeld(r1),h2=isHeld(r2);if(h1===h2)continue;
    const hi=h1?d.i1:d.i2;if(d.stair&&hi!==d.i1)continue;
    const c=tc(hi),mx=(c[0]-d.P[0])*2,mz=(c[1]-d.P[1])*2;
    d.m=[mx,mz];d.hold=[d.P[0]+mx*0.3,d.P[1]+mz*0.3];d.threat=[d.P[0]-mx*0.6,d.P[1]-mz*0.6];
    d.heldRoom=h1?r1:r2;out.push(d);
  }
  return out;
}
function inFunnel(x,z,d){if(d.stair||floorOf(x)!==floorOf(d.P[0]))return false;const vx=x-d.P[0],vz=z-d.P[1],al=vx*d.m[0]+vz*d.m[1],lat=Math.abs(vx*d.m[1]-vz*d.m[0]);
  return al>0.1&&al<5&&lat<0.55+al*0.4;}
function geomFor(d,ai,bi){
  const nx=ix(bi)-ix(ai),nz=iy(bi)-iy(ai),tx=-nz,tz=nx,Px=d.P[0],Pz=d.P[1],room=G.rooms[G.rid[bi]];
  let Lp=-1e9,Lm=1e9,D=0;
  for(const c of [[room.x,room.y],[room.x+room.w,room.y],[room.x,room.y+room.h],[room.x+room.w,room.y+room.h]]){
    const dl=(c[0]-Px)*tx+(c[1]-Pz)*tz,dn=(c[0]-Px)*nx+(c[1]-Pz)*nz;Lp=Math.max(Lp,dl);Lm=Math.min(Lm,dl);D=Math.max(D,dn);}
  const leaf=!d.arch&&!d.stair,inward=leaf&&G.rid[d.swingTile]===room.id,hs=leaf?Math.sign((d.hinge[0]-Px)*tx+(d.hinge[1]-Pz)*tz)||1:1;
  return {Px,Pz,nx,nz,tx,tz,Lp,Lm:-Lm,D,room,approach:G.rid[ai],leaf,inward,hs};
}
/* somewhere a man can stand in a given room: on the floor, off furniture and off a stair flight */
const standIdx=(i,rid)=>i>=0&&G.rid[i]===rid&&!G.blocked[i]&&G.rampOf[i]<0;
const standAt=(p,rid)=>standIdx(tileIdx(p[0],p[1]),rid);
/* door frame: lat along the wall (+t), dep into the room (+n), from the door centre */
const framer=g=>(lat,dep)=>[g.Px+g.nx*dep+g.tx*lat,g.Pz+g.nz*dep+g.tz*lat];
function okApproach(p){return standAt(p,team.geo.approach);}
/* stack options, scored by how many other danger areas can see into the stack */
function stackFor(g,Fr,self){
  const {Px,Pz,nx,nz,tx,tz,approach}=g;
  let ok=p=>standAt(p,approach);
  const expo=pts=>{let x=0;for(const d of Fr){if(d===self||d.stair)continue;const o=d.threat;
    for(const p of pts)if(Math.hypot(p[0]-o[0],p[1]-o[1])<8&&los(o[0],o[1],p[0],p[1],true))x++;}return x;};
  const P=framer(g);
  const opts=[];
  const N=team.ops.length;
  if(self.arch&&N>=4){ // hallway junction: 2x2, #1-#2 left, #3-#4 right (FM 3-06.11)
    const sl=[P(-0.45,-0.55),P(-0.45,-1.25),P(0.45,-0.55),P(0.45,-1.25)];
    if(sl.every(ok))return {slots:sl,s:1,type:'tee',exp:expo(sl)};}
  const along=(ss,i)=>P(ss*(0.95+0.75*i),-0.45);
  const pull=g.leaf&&!g.inward,sideOK=ss=>!pull||ss===-g.hs; // outward-opening: stay out of the leaf's swing
  const inSwing=p=>{if(!pull)return false;const lat=(p[0]-Px)*tx+(p[1]-Pz)*tz,dep=(p[0]-Px)*nx+(p[1]-Pz)*nz;return lat*g.hs>-0.25&&dep>-1.2;};
  const ok0=ok;ok=p=>ok0(p)&&!inSwing(p);
  const pad=sl=>{while(sl.length<4)sl.push(sl[sl.length-1].slice());return sl;},use=sl=>sl.slice(0,N);
  for(const ss of [1,-1]){if(!sideOK(ss))continue;
    const sl=[0,1,2,3].map(i=>along(ss,i));
    if(use(sl).every(ok)){opts.push({slots:sl,s:ss,type:'side',exp:expo(use(sl)),pen:0});continue;}
    // wall runs out (a corner, furniture): the stack bends and continues straight back from the last man on the wall,
    // still off the door's axis, rather than lining up in the fatal funnel
    if(!ok(along(ss,0)))continue;const bs=[];let last=null;
    for(let i=0;i<N;i++){const a=along(ss,i);if(!last&&ok(a)&&bs.every(q=>Math.hypot(q[0]-a[0],q[1]-a[1])>0.5)){bs.push(a);continue;}
      last=last||bs[bs.length-1];const j=bs.length-(bs.indexOf(last)),b=[last[0]-nx*0.8*j,last[1]-nz*0.8*j];
      if(!ok(b))break;bs.push(b);}
    if(bs.length===N)opts.push({slots:pad(bs),s:ss,type:'side',exp:expo(bs),pen:0.25});}
  if(self.o<0.3&&!pull&&N>=4)for(const ss of [1,-1]){ // split stack: a pair on each side of a closed door
    const sl=[along(ss,0),along(-ss,0),along(ss,1),along(-ss,1)];
    if(sl.every(ok))opts.push({slots:sl,s:ss,type:'split',exp:expo(sl),pen:0.35});}
  for(const ss of [1,-1]){if(!sideOK(ss))continue;const sl=[0,1,2,3].map(i=>P(ss*0.3,-(0.75+0.6*i)));
    if(use(sl).every(ok))opts.push({slots:sl,s:ss,type:'line',exp:expo(use(sl)),pen:0.6});}
  if(!opts.length){const sl=clusterSlots(g,4,inSwing);opts.push({slots:sl,s:1,type:'line',exp:expo(sl),pen:0.6});}
  const fit=opts.some(o=>o.type!=='line')?opts.filter(o=>o.type!=='line'):opts; // a file in the fatal funnel only when nothing else fits
  fit.forEach(o=>o.r=o.exp+o.pen+Math.random()*0.5);fit.sort((a,b)=>a.r-b.r);return fit[0];
}
/* last resort: the nearest free spots on the near side of the door, a body's width apart */
function clusterSlots(g,n,avoid=()=>false){
  const {Px,Pz,nx,nz,approach}=g,aim=[Px-nx*0.7,Pz-nz*0.7],cands=[];
  for(let x=Math.floor(Px)-5;x<=Math.floor(Px)+5;x+=0.5)for(let z=Math.floor(Pz)-5;z<=Math.floor(Pz)+5;z+=0.5){
    const px=x+0.25,pz=z+0.25,i=tileIdx(px,pz);if(!standIdx(i,approach))continue;
    if((px-Px)*nx+(pz-Pz)*nz>-0.3||avoid([px,pz]))continue;cands.push([px,pz,Math.hypot(px-aim[0],pz-aim[1])]);}
  cands.sort((a,b)=>a[2]-b[2]);const out=[];
  for(const c of cands){if(out.every(o=>Math.hypot(o[0]-c[0],o[1]-c[1])>=0.6))out.push([c[0],c[1]]);if(out.length===n)break;}
  while(out.length<n)out.push(out.length?out[out.length-1].slice():aim);
  return out;
}
function releaseAim(op){const e=op.aim;if(e&&e.eng&&e.eng.op===op)e.eng=null;op.aim=null;op.blocked=false;}
function resetOp(op){op.peekLean=0;op.peekLow=false;op.peekAt=null;op.looking=false;op.hunt=null;releaseAim(op);op.look=null;op.pie=false;op.forceAim=false;op.blocked=false;op.low=false;op.teeHigh=false;op.waited.clear();op.cover=null;op.entry=null;}

function plan(){
  const lead=team.ops[0],li=tileIdx(lead.x,lead.z),{dist}=bfs(li<0?0:li,teamAllowed);
  const Fr=frontierDoors();team.frontier=Fr;
  const fl=curFloor();
  let best=null;
  const C=team.contact&&!team.contact.cleared&&simT-team.contact.contactT<25?team.contact:null,cf=C?floorOf(C.x):-1; // fresh fire from a room
  for(const d of Fr){
    const ai=G.rooms[G.rid[d.i1]]===d.heldRoom?d.i1:d.i2,bi=ai===d.i1?d.i2:d.i1;
    if(dist[ai]<0||G.blocked[ai])continue;
    let g,st,sc=dist[ai]+Math.random()*1.5;
    {const hr=G.rooms[G.rid[bi]];if(hr&&simT-(hr.heardT||-99)<8&&!d.stair)sc-=12;} // movement heard in there
    if(C&&!d.stair&&cf===floorOf(d.P[0]))sc+=(G.rooms[G.rid[bi]]===C?-30:0)+Math.hypot(d.P[0]-C.contactP[0],d.P[1]-C.contactP[1])*0.8; // toward the fire
    if(d.stair){ // finish the floor before going up
      const up=G.rooms[G.rid[bi]];
      if(C&&cf===floorOf(up.x))sc-=10; // the fire is upstairs: go up now
      else if(Fr.some(o=>!o.stair&&floorOf(o.P[0])===fl&&o!==d))sc+=40;
      g={stair:true,room:G.rooms[G.rid[bi]],approach:G.rid[ai]};st={exp:0};
    }else{g=geomFor(d,ai,bi);st=stackFor(g,Fr,d);sc+=st.exp*3;if(floorOf(d.P[0])!==fl)sc+=20;}
    if(!best||sc<best.sc)best={d,g,st,sc,ai,bi};
  }
  if(!best){HOOK('noplan',{});
    // something is still uncleared but out of reach (an open leaf in a tight spot): plan once more ignoring leaves
    const left=G.rooms.some(r=>r.id>1&&!r.cleared);
    if(left&&!G.noLeaf){G.noLeaf=true;try{plan();}finally{G.noLeaf=false;}return;}
    if(left){team.stuckPlans=(team.stuckPlans||0)+1;if(team.stuckPlans<50)return;} // keep trying for a moment before giving up
    secure();return;}
  team.stuckPlans=0;
  const {g,st,d}=best;HOOK('plan',{room:g.room,contact:team.contact&&!team.contact.cleared&&simT-team.contact.contactT<25?team.contact:null});
  team.door=d;team.room=g.room;team.geo=g;g.seen=makeSeen(g.room);
  if(team.lastRoom&&ridAt(lead.x,lead.z)===team.lastRoom.id&&g.approach!==team.lastRoom.id)say(lead,'COMING OUT');
  team.ops.forEach(resetOp);
  if(d.stair){ // stack at the foot of the flight
    const S=G.rooms[G.rid[best.ai]],si=S.si,u=si.u;
    const ok=p=>{const i=tileIdx(p[0],p[1]);return i>=0&&teamAllowed(i);};
    const slots=[[si.rampStart[0]-u[0]*0.15,si.rampStart[1]-u[1]*0.15],si.land.slice(),si.out.slice(),ok(si.out2)?si.out2.slice():[si.out[0]-u[0]*0.4,si.out[1]-u[1]*0.4]];
    team.slots=slots;g.si=si;g.type='stair';g.wall='STAIR';g.fed='STAIRWELL';
    const upA=Math.atan2(u[1],u[0]),back=Math.atan2(-u[1],-u[0]);
    team.ops.forEach((op,i)=>{const [sx,sz]=slots[i];goTo(op,sx,sz,1.45);op.delay=i*0.6;op.face=isRear(op)?back:upA;});
    if(tap(team.ops[1],team.ops[0]))team.ops[0].delay=0.4;
    setState('move');team.coverT=0;comms('TL',`MOVE · STAIRWELL → ${g.room.label}`);return;
  }
  const {Px,Pz,nx,nz,tx,tz,Lp,Lm,D,room}=g,{slots,s,type}=st;
  const rear=type==='line'?Math.atan2(-nz,-nx):Math.atan2(tz*s-nz*0.4,tx*s-nx*0.4);
  const rearB=Math.atan2(-tz*s-nz*0.4,-tx*s-nx*0.4);
  const fed=Math.min(Lp,Lm)<1.3?'CORNER-FED':'CENTER-FED';
  const small=room.hall||room.stair||(Lp+Lm)<3.6||D<2.6;
  Object.assign(g,{s,type,rear,fed,small,wall:wallName(nx,nz),exp:st.exp});
  team.slots=slots;
  team.ops.forEach((op,i)=>{
    const [sx,sz]=slots[i];goTo(op,sx,sz,1.45);op.delay=i*0.6;
    const toDoor=Math.atan2(Pz-nz*0.2-sz,Px-nx*0.2-sx);
    // #1 on the door; the rest at low ready angled outboard, away from the man in front; the last man rear security
    const cr=Math.cos(toDoor)*(-nz)-Math.sin(toDoor)*(-nx),sg=Math.sign(cr)||1;
    // outboard: the first angle off the door line that keeps the muzzle clear of every other slot within reach
    const clearOf=a=>slots.slice(0,team.ops.length).every((q,j)=>{if(j===i)return true;const dx=q[0]-sx,dz=q[1]-sz,d=Math.hypot(dx,dz);
      return d>1.6||Math.abs(angDiff(a,Math.atan2(dz,dx)))>Math.atan2(0.42,Math.max(d,0.3))+0.3;});
    const pref=i===1?1.0:1.15,ks=[];for(let k=-1.5;k<=3.1;k+=0.15)ks.push(k);ks.sort((a,b)=>Math.abs(a-pref)-Math.abs(b-pref));
    const kk=ks.find(k=>clearOf(toDoor+sg*k)),out=toDoor+sg*(kk??pref);
    op.face=type==='tee'?Math.atan2(nz,nx):isRear(op)?(type==='split'?rearB:rear):i===0||(type==='split'&&i===1)?toDoor:out;
  });
  if(tap(team.ops[1],team.ops[0]))team.ops[0].delay=0.4; // "move" signal to the point man
  setState('move');team.coverT=0;
  comms('TL',`MOVE · ${room.label} ${d.arch?'OPENING':g.wall+' DOOR'}`);
}

/* ---------- pre-entry: breach, quick peek, slicing the pie, stun ---------- */
function preEntry(){
  const g=team.geo,d=team.door;HOOK('pre',{g,d,opened:d.o>0.5});
  if(g.stair){startClimb();return;}
  if(g.type==='tee'){startTee();return;}
  const opened=d.o>0.5;
  const canPie=g.type==='side'||g.type==='split'||(g.type==='line'&&(opened||team.ops.length===1));
  g.pie=canPie&&(team.ops.length===1||opened||(compromised&&Math.random()<0.38)||(g.type==='split'&&Math.random()<0.4));
  g.stun=!g.room.hall&&!opened&&compromised&&Math.random()<0.4;
  // quick peek: at an opening that is already open, #1 snatches a look past the jamb before the team commits
  g.peek=opened&&g.type==='side'&&team.ops.length>=2&&Math.random()<(compromised?0.45:0.3);
  if(g.peek)g.pie=false;
  // a hostile already seen or heard in there: slicing the pie is for finding him, and he is found. Engage what can be
  // seen from where you stand, stun if there is a thrower, and go in on momentum (surprise, speed, violence of action)
  if(enemies.some(e=>e.alive&&e.room===g.room.id&&knownThreat(e))){g.pie=false;g.peek=false;g.hot=true;
    g.stun=team.ops.length>=2&&!g.room.hall;comms(1,`THREAT KNOWN · ${g.room.label} · ${g.stun?'STUN AND ':''}GO`,'alert');}
  if(!opened&&d.locked)startBreach();else afterBreach();
}
/* ballistic breach by #4 from a spot where the shot line to the latch is clear of everyone;
   if there is no such spot, #1 kicks it (mechanical breach) */
function segBlocked(p,q,skip,rad=0.5){const dx=q[0]-p[0],dz=q[1]-p[1],L2=dx*dx+dz*dz||1e-6;
  return team.ops.some(o=>{if(o===skip||floorOf(o.x)!==floorOf(p[0]))return false;const t=((o.x-p[0])*dx+(o.z-p[1])*dz)/L2;if(t<-0.1||t>1.05)return false;
    return Math.hypot(p[0]+dx*t-o.x,p[1]+dz*t-o.z)<rad;});}
function startBreach(){
  const g=team.geo,{Px,Pz,nx,nz,tx,tz}=g,b=team.ops.length>=3?team.ops[team.ops.length-1]:null,ls=-g.hs,latch=[Px+tx*ls*0.36,Pz+tz*ls*0.36];
  setState('breach');g.latch=latch;g.breacher=b;if(!b){kickBreach();return;}
  const cands=[[0.75,0.3],[0.7,0.65],[0.95,0.1],[0.6,0.95],[1.05,0.55],[0.8,-0.2]].map(([dep,lat])=>[Px-nx*dep+tx*ls*lat,Pz-nz*dep+tz*ls*lat]);
  const bp=cands.find(p=>okApproach(p)&&team.ops.every(o=>o===b||Math.hypot(o.x-p[0],o.z-p[1])>0.6)&&!segBlocked(p,latch,b));
  if(!bp){kickBreach();return;}
  g.breachStage='move';goTo(b,bp[0],bp[1],1.8);b.delay=0;b.look=latch;say(b,'BREACHER UP');
}
function kickBreach(){
  const g=team.geo;g.breachStage='kick';const b=g.breacher;if(b){b.forceAim=false;b.look=null;}
  say(team.ops[0],'BREACHING');
  at(0.5,()=>{if(team.state!=='breach')return;team.door.breached=true;team.door.slam=true;comms(1,`MECHANICAL BREACH · ${g.room.label}`);});
  at(0.95,()=>{if(team.state==='breach')afterBreach();});
}
function afterBreach(){const g=team.geo;if(g.peek&&!g.peeked)startPeek();else if(g.pie)startPie();else if(g.stun)startStun();else startEntry();}
/* quick peek (FM 3-06.11: "quick peek" at a corner or doorway): step to the jamb, lean the head and shoulders past it for
   a moment, pull back; a second look at another height if the first showed nothing. What was seen decides the entry. */
function startPeek(){
  const g=team.geo,{Px,Pz,nx,nz,tx,tz,s}=g,op=team.ops[0];setState('peek');g.peeked=true;
  const P=framer(g);let spot=null;
  for(const [lat,dep] of [[0.6,-0.3],[0.7,-0.4],[0.85,-0.45]]){const q=P(s*lat,dep);if(okApproach(q)){spot=q;break;}}
  if(!spot){g.peek=false;g.pie=true;afterBreach();return;}
  goTo(op,spot[0],spot[1],1.2);op.delay=0;op.peekAt=P(-s*1.6,2.2);
  g.pk={n:0,t:0,out:false,spotted:null,max:Math.random()<0.45?2:1};
  comms(1,`QUICK PEEK · ${g.room.label}`);
}
function peekStep(dt){
  const g=team.geo,op=team.ops[0],pk=g.pk;if(op.wp.length||op.aim)return;
  pk.t+=dt;
  if(!pk.out&&pk.t>0.15){pk.out=true;pk.t=0;op.peekLean=pk.n===1?0.36:0.42;op.peekLow=pk.n===1;}
  if(pk.out){
    const e=eyeOf(op);
    for(const en of enemies)if(en.alive&&en.room===g.room.id&&los(e[0],e[1],en.x,en.z)){const a=Math.atan2(en.z-e[1],en.x-e[0]);
      if(Math.abs(angDiff(op.h,a))<1.1){pk.spotted=en;en.spottedT=simT;}}
    if(pk.t>0.5){pk.out=false;pk.t=0;op.peekLean=0;op.peekLow=false;pk.n++;
      if(pk.spotted||pk.n>=pk.max){
        const sp=pk.spotted;HOOK('peek',{spotted:!!sp});
        if(sp){const lat=(sp.x-g.Px)*g.tx+(sp.z-g.Pz)*g.tz;say(op,lat*g.s>0?'ONE · NEAR CORNER':'ONE · FAR SIDE');comms(1,`PEEK · CONTACT · ${g.room.label}`,'alert');
          g.stun=team.ops.length>=2&&!g.room.hall;if(!g.stun)g.pie=true;}
        else{comms(1,`PEEK · NO CONTACT · ${g.room.label}`);g.pie=true;} // nothing in view: slice the rest of the room before going in
        at(0.25,()=>{if(team.state!=='peek')return;op.peekAt=null;if(g.stun)startStun();else if(g.pie)startPie();else startEntry();});}}}
}
function eyeOf(op){const b=op.body,y=b?b.yaw:op.h,r=b?b.roll:0;return [op.x-Math.sin(y)*Math.sin(r)*0.62,op.z+Math.cos(y)*Math.sin(r)*0.62];}
function startPie(){
  const g=team.geo,{Px,Pz,nx,nz,tx,tz,s}=g;setState('pie');team.door.breached=true;g.pieT=0;
  const arc=(side,from,to)=>{const pts=[],r=1.1,n=8;
    for(let i=0;i<=n;i++){const ph=(from+(to-from)*i/n)*side,p=[Px+(-nx*Math.cos(ph)+tx*Math.sin(ph))*r,Pz+(-nz*Math.cos(ph)+tz*Math.sin(ph))*r];
      if(!okApproach(p))break;pts.push(p);}return pts;};
  const piers=g.type==='split'?[[team.ops[0],s],[team.ops[1],-s]]:[[team.ops[0],s]];
  const to=g.type==='split'?0.28:g.leaf&&!g.inward?0.05:-0.42; // a lone pier slices past the centerline (not into an outward leaf)
  if(g.type==='line'){ // file stack in front of the opening: #1 steps out to one side and slices across; the file eases back to give him room
    const a1=arc(s,1.25,to),a2=arc(-s,1.25,to),pick=a1.length>=a2.length?s:-s,pts=pick===s?a1:a2;
    if(pts.length<5){g.pie=false;if(g.stun)startStun();else startEntry();return;}
    piers[0][1]=pick;
    team.ops.slice(1).forEach(o=>{const p=[o.x-nx*0.45,o.z-nz*0.45];if(okApproach(p)){goTo(o,p[0],p[1],1.2);o.delay=0;}});}
  for(const [op,side] of piers){op.wp=arc(side,1.25,to);op.spd=0.8;op.delay=0;op.pie=true;op.cover=null;}
  comms(1,`SLICING THE PIE · ${g.room.label}`);
}
function startStun(){
  const g=team.geo,{Px,Pz,nx,nz,tx,tz,D}=g,th=team.ops[Math.min(1,team.ops.length-1)];setState('stun');openDoor(team.door,1.9); // the thrower cracks it
  say(th,'BANG OUT',true);
  const tp=[Px+nx*Math.min(D*0.55,2.6)+tx*rnd(-0.5,0.5),Pz+nz*Math.min(D*0.55,2.6)+tz*rnd(-0.5,0.5)];
  const c=Math.cos(th.h),s=Math.sin(th.h);
  nades.push({a:[th.x+c*0.25,1.45,th.z+s*0.25],b:[tp[0],0.06,tp[1]],p:[th.x,1.45,th.z],t:0,T:0.55,fuse:1.35,room:g.room.id,done:false});
}
/* ---------- entry techniques: room (cross / buttonhook / crisscross), T-intersection 2x2, stairwell ---------- */
function startEntry(){
  const g=team.geo,{Px,Pz,nx,nz,tx,tz,s,Lp,Lm,D,room}=g;
  const P=framer(g);
  const ext=sd=>sd>0?Lp:Lm,Lu=sd=>Math.min(ext(sd)-0.75,4.2);
  // FM 3-06.11: #1 goes away from the hinges if the door opens in, toward them if it opens out,
  // unless that side is blocked; from a split stack the lead pair crosses.
  let dir1=g.type==='split'?-s:(g.inward?-g.hs:g.hs),why1='door';
  // what the team already knows overrides the default: a hostile seen, heard firing or reported from the peek -> #1 goes
  // to that side (engaging on the way); a pie / peek that left one side unseen -> #1 takes the unseen side
  if(g.type!=='split'){
    const lat=q=>(q[0]-Px)*tx+(q[1]-Pz)*tz;
    const known=enemies.filter(e=>e.alive&&e.room===room.id&&knownThreat(e));
    if(known.length){const sl=known.reduce((a,e)=>a+Math.sign(lat([e.x,e.z])||1),0);if(sl)dir1=Math.sign(sl),why1='threat';}
    else if(g.seen&&g.seen.n>0){let u=[0,0];g.seen.pts.forEach((q,k)=>{if(!g.seen.seen[k])u[lat(q)>0?0:1]++;});
      if(u[0]>u[1]*1.4+2)dir1=1,why1='unseen';else if(u[1]>u[0]*1.4+2)dir1=-1,why1='unseen';}}
  if(Lu(dir1)<0.6&&Lu(-dir1)>=0.6)dir1=-dir1;
  const tech=g.type==='split'?'CRISSCROSS':dir1===s?'BUTTONHOOK':'CROSS';HOOK('entry',{tech,why:why1,dir1,g});
  const sA=dir1,sB=-dir1,uA=Lu(sA),uB=Lu(sB);
  const d1=Math.max(0.5,Math.min(0.95,D-0.55)),d2=Math.max(d1,Math.min(1.75,D-0.65));
  const pods=[null,null,null,null];
  if(uA>=0.6&&uB>=0.6){
    pods[0]=[sA*uA,d1];pods[1]=[sB*uB,d1];
    if(!g.small){pods[2]=[sA*Math.max(0.55,uA*0.42),d2];pods[3]=[sB*Math.max(0.55,uB*0.42),d2];}
  }else{
    const su=uA>=uB?sA:sB,u=Math.max(0.5,uA,uB);
    pods[0]=[su*u,d1];pods[1]=[su*Math.min(0.5,u*0.3),Math.max(d1,Math.min(2.0,D-0.65))];
    if(!g.small&&u>2.4)pods[2]=[su*u*0.58,d2];
  }
  const fixPod=(lat,dep)=>{for(let k=0;k<6;k++){const p=P(lat,dep),i=tileIdx(p[0],p[1]);
      if(standIdx(i,room.id))return [lat,dep];lat*=0.75;dep=Math.max(d1,dep*0.8);}return [0,Math.min(0.7,D-0.4)];};
  const delays=g.type==='split'?[0,0.28,0.62,0.9]:[0,0.4,0.8,1.2];
  const N=team.ops.length,nIn=pods.slice(0,N).filter(Boolean).length;
  const pied=!!g.pie;
  team.ops.forEach((op,i)=>{
    resetOp(op);
    const side=Math.sign((op.x-Px)*tx+(op.z-Pz)*tz)||s;
    if(pods[i]){
      const aroundLeaf=g.leaf&&g.inward&&Math.sign(pods[i][0])===g.hs&&Math.abs(pods[i][0])>0.3&&D>1.8;
      const [lat,dep]=fixPod(pods[i][0],aroundLeaf?Math.max(pods[i][1],1.2):pods[i][1]);const pt=P(lat,dep);
      op.wp=aroundLeaf?[P(side*0.12,-0.3),P(-g.hs*0.1,0.6),P(lat*0.3,1.25),pt]:[P(side*0.12,-0.3),P(lat*0.15,0.6),pt];
      op.spd=2.3;op.delay=delays[i];
      const ls=Math.sign(lat)||1;const Q=P(-ls*Math.min(ext(-ls),3)*0.6,D*0.8);
      op.face=Math.atan2(Q[1]-pt[1],Q[0]-pt[0]);
      // where the muzzle goes while crossing the threshold:
      //  after a pie the far room is seen already; what is left is the hard corner on each side of the door (dead space).
      //  on a dynamic entry #1/#2 take the area to their front first, then the wall on their side (FM 3-06.11);
      //  #3/#4 start at the center of the far wall.
      const corner=P(ls*Math.max(0.3,ext(ls)-0.3),0.3),front=P(lat*0.35,D*0.85),farC=P(0,D*0.9);
      op.entry={i,corner,front,farC,pied};
    }else if(i===2){
      op.wp=[P(side*0.15,-0.55)];op.spd=1.6;op.delay=delays[i];op.face=Math.atan2(nz,nx);
    }else{
      op.wp=[team.slots[g.type==='split'?3:0].slice()];op.spd=1.4;op.delay=delays[i];op.face=g.type==='split'?Math.atan2(-tz*s,-tx*s):g.rear;
    }
  });
  setState('entry');team.entryT=0;team.coverT=0;
  if(team.door&&!team.door.breached){openDoor(team.door,1.05);noise(Px,Pz,8);} // #1 opens it as he reaches it
  g.entryText=(N===1?'SOLO · LIMITED PENETRATION':nIn<N?'LIMITED PENETRATION':TEAM_WORD[N])+' · '+tech;
  comms(1,`ENTRY · ${room.label} · ${tech}`);
}
/* FM 3-06.11 T-intersection: 2x2, the front men go low and turn out on signal, the rear men step up and turn high */
function startTee(){
  const g=team.geo,{Px,Pz,nx,nz,tx,tz,Lp,Lm,room}=g;
  const P=framer(g);
  const L=Lm>1.3,Rr=Lp>1.3,endOn=!L&&!Rr;
  const fwd=Math.atan2(nz,nx),left=Math.atan2(-tz,-tx),right=Math.atan2(tz,tx);
  const plan_=endOn
    ?[[P(-0.4,0.35),fwd,true],[P(-0.4,-0.25),fwd,false],[P(0.4,0.35),fwd,true],[P(0.4,-0.4),Math.atan2(-nz,-nx),false]]
    :[[P(-0.45,0.45),L?left:fwd,true],[P(-0.45,-0.05),L?left:fwd,false],[P(0.45,0.45),Rr?right:fwd,true],[P(0.45,-0.05),Rr?right:fwd,false]];
  team.ops.forEach((op,i)=>{resetOp(op);const [pt,fc,low]=plan_[i];
    op.wp=[pt];op.spd=1.3;op.delay=(i===0||i===2)?0:0.2;op.face=fc;op.low=low;op.teeHigh=!low&&!(endOn&&i===3);});
  setState('entry');team.entryT=0;team.coverT=0;
  g.entryText=endOn?'HALLWAY · HIGH/LOW':'T-INTERSECTION · HIGH/LOW';
  comms(1,`${endOn?'HALLWAY':'T-INTERSECTION'} · ${room.label} · 2x2 HIGH/LOW`);
  noise(Px,Pz,6);
}
/* FM 3-06.11 stairwell: three-man flow with overwatch up the stairs; #4 holds the bottom */
function startClimb(){
  const g=team.geo,d=team.door,U=g.room,ui=U.si,si=g.si;
  const allowU=i=>teamAllowed(i)||(G.rid[i]===U.id&&!G.blocked[i]);
  const arrive=tc(d.i2),awayU=Math.atan2(-ui.u[1],-ui.u[0]);
  const spots=[[ui.rampStart[0],ui.rampStart[1],awayU],[arrive[0],arrive[1],ui.up?Math.atan2(ui.u[1],ui.u[0]):awayU],
    [tc(d.i1)[0]-si.u[0]*0.35,tc(d.i1)[1]-si.u[1]*0.35,Math.atan2(si.u[1],si.u[0])]];
  team.ops.forEach((op,i)=>{resetOp(op);
    if(i<3){const [x,z,f]=spots[i];goTo(op,x,z,1.5,allowU);op.delay=i*0.45;op.face=f;}
    else{op.face=Math.atan2(-si.u[1],-si.u[0]);}});
  setState('entry');team.entryT=0;team.coverT=0;
  g.entryText='STAIRWELL · MOVING UP';
  say(team.ops[0],'COMING UP');comms(1,`STAIRWELL · ${U.label} · MOVING UP`);
}

/* ---------- clearing by sight: a room is clear when it has actually been looked at ---------- */
/* clearing is seeing: the target room is sampled every 0.5 m; a point is cleared once someone has looked at it */
function makeSeen(room){const pts=[];
  for(let z=room.y+0.25;z<room.y+room.h;z+=0.5)for(let x=room.x+0.25;x<room.x+room.w;x+=0.5){const i=tileIdx(x,z);
    if(i<0||G.blocked[i]||G.rid[i]!==room.id)continue;pts.push([x,z]);}
  return {pts,seen:new Uint8Array(pts.length),n:0,fl:floorOf(room.x)};}
const seenFrac=()=>{const S=team.geo&&team.geo.seen;return !S||!S.pts.length?1:S.n/S.pts.length;};
function updateSeen(){
  const S=team.geo&&team.geo.seen;if(!S||S.n>=S.pts.length)return;
  for(const op of team.ops){if(floorOf(op.x)!==S.fl)continue;const c=Math.cos(op.h),s=Math.sin(op.h),[ex,ez]=eyeOf(op);
    for(let k=0;k<S.pts.length;k++){if(S.seen[k])continue;const p=S.pts[k],dx=p[0]-ex,dz=p[1]-ez,d=Math.hypot(dx,dz);
      if(d>12)continue;if(d>0.6&&(dx*c+dz*s)/d<0.8)continue; // ~±37° of where he is looking
      if(!los(ex,ez,p[0],p[1]))continue;S.seen[k]=1;S.n++;}}
}
/* the unseen spot this man should look at next: close to where he already looks, inside his sector if he has one */
function unseenTarget(op,sectorPt){
  const S=team.geo&&team.geo.seen;if(!S||S.n>=S.pts.length||floorOf(op.x)!==S.fl)return null;
  if(op.uPt&&simT<op.uUntil&&!S.seen[op.uK])return op.uPt;
  const secA=sectorPt?Math.atan2(sectorPt[1]-op.z,sectorPt[0]-op.x):null,cand=[];
  for(let k=0;k<S.pts.length;k++){if(S.seen[k])continue;const p=S.pts[k],dx=p[0]-op.x,dz=p[1]-op.z,d=Math.hypot(dx,dz);if(d>12||d<0.3)continue;
    const a=Math.atan2(dz,dx);let sc=Math.abs(angDiff(op.h,a))*1.3+d*0.12;if(secA!==null&&Math.abs(angDiff(secA,a))>1.1)sc+=1.6;cand.push([sc,k,p]);}
  cand.sort((a,b)=>a[0]-b[0]);
  for(let j=0;j<Math.min(6,cand.length);j++){const [,k,p]=cand[j];if(los(op.x,op.z,p[0],p[1])){op.uK=k;op.uPt=p;op.uUntil=simT+0.3;return p;}}
  op.uPt=null;return null;
}

/* ---------- security and muzzle discipline: danger-area cover, muzzle on a teammate, rifle vs bodies ---------- */
/* the seen count has stalled: step one man (inside, not busy) to where the most of what is left can be seen */
function lookAround(dt){
  const S=team.geo&&team.geo.seen;if(!S)return;
  if(S.n!==S.lastN){S.lastN=S.n;S.stall=0;return;}
  S.stall=(S.stall||0)+dt;if(S.stall<0.7||(S.moveT&&simT<S.moveT))return;
  const room=team.room,cands=team.ops.filter(o=>ridAt(o.x,o.z)===room.id&&!o.aim&&!o.hunt&&!o.cover&&!o.wp.length&&floorOf(o.x)===S.fl);if(!cands.length)return;
  const left=S.pts.filter((p,k)=>!S.seen[k]);if(!left.length)return;
  const inRoom=i=>G.rid[i]===room.id&&!G.blocked[i]; // stay inside: no detour out through another (closed) door
  let best=null;
  for(const op of cands){const oi=tileIdx(op.x,op.z),{dist}=bfs(oi<0?0:oi,inRoom);
    for(let z=room.y+0.5;z<room.y+room.h;z+=1)for(let x=room.x+0.5;x<room.x+room.w;x+=1){const i=tileIdx(x,z);
      if(!standIdx(i,room.id)||dist[i]<0)continue;
      if(team.ops.some(o=>o!==op&&Math.hypot(o.x-x,o.z-z)<0.7))continue;
      let n=0;for(const p of left)if(Math.hypot(p[0]-x,p[1]-z)<9&&los(x,z,p[0],p[1]))n++;
      const sc=n-Math.hypot(x-op.x,z-op.z)*0.6;if(n&&(!best||sc>best.sc))best={sc,op,x,z,n};}}
  S.moveT=simT+1.2;S.stall=0;if(!best){S.noSpot=true;return;} // what is left cannot be seen from anywhere he can stand
  const {op,x,z}=best;goTo(op,x,z,1.2,inRoom);op.delay=0;op.looking=true;
  let cx=0,cz=0;for(const p of left){cx+=p[0];cz+=p[1];}op.face=Math.atan2(cz/left.length-z,cx/left.length-x);
}
/* who is free to pull security, and on which danger area */
function coverFree(o){
  if(o.pie||o.forceAim||o.low||o.teeHigh)return false;
  switch(team.state){
    case 'move':return o.id>=2;
    case 'stacked':case 'peek':case 'pie':case 'stun':return isRear(o)||(team.geo&&team.geo.type==='split'&&o.id===3);
    case 'breach':return team.ops.length>=4&&o.id===3;
    case 'entry':case 'hold':return o.delay<=0&&o.wp.length===0;
    default:return false;
  }
}
function assignCover(){
  const Fr=frontierDoors();team.frontier=Fr;
  const had=new Map(team.ops.map(o=>[o,o.cover]));team.ops.forEach(o=>o.cover=null);
  if(team.state==='secure'||team.state==='plan'){Fr.forEach(d=>d.covered=false);return;}
  const stackDoor=['move',...PRE].includes(team.state)?team.door:null;
  const pairs=[];
  for(const d of Fr){if(d===stackDoor)continue;
    for(const o of team.ops){if(!coverFree(o))continue;
      const dd=Math.hypot(d.hold[0]-o.x,d.hold[1]-o.z);if(dd>11||dd<0.3)continue;
      if(team.state==='move'&&o.moving){if(dd>7)continue;const ang=Math.abs(angDiff(o.mh,Math.atan2(d.P[1]-o.z,d.P[0]-o.x)));if(!isRear(o)&&ang>1.75)continue;}
      if(!los(o.x,o.z,d.hold[0],d.hold[1]))continue;
      const keep=had.get(o)===d;
      if(!keep&&flagAt(o,Math.atan2(d.P[1]-o.z,d.P[0]-o.x),0.55,0,dd))continue; // would sweep a teammate (a man already on it dips instead)
      pairs.push([keep?dd-2:dd,o,d]);}}
  pairs.sort((a,b)=>a[0]-b[0]);
  const uo=new Set(),ud=new Set();
  // while the room is not seen yet, at least one man inside keeps looking into it instead of pulling security
  const scanning=team.state==='hold'&&team.room&&seenFrac()<SEEN_OK,ins=o=>ridAt(o.x,o.z)===team.room.id;
  let freeIn=scanning?team.ops.filter(o=>ins(o)).length:0;
  for(const [,o,d] of pairs){if(uo.has(o)||ud.has(d))continue;if(scanning&&ins(o)){if(freeIn<=1)continue;freeIn--;}
    o.cover=d;uo.add(o);ud.add(d);}
  Fr.forEach(d=>d.covered=ud.has(d)||d===stackDoor);
}

/* muzzle management between teammates: does a muzzle along yaw cover a teammate?
   High ready points over heads; a lowered muzzle only reaches as far as it meets the floor (~1.6 m at low ready). */
function flagAt(op,yaw,pose,hi,range=9,lead=0,asCarried=false){
  if(hi>0.5||(!asCarried&&(op.tuck||0)>0.5))return null; // asCarried: would the gun cover him once out of SUL?
  const pit=poseAt(pose,hi).pitch,c=Math.cos(yaw),s=Math.sin(yaw),reach=pit>0.05?Math.min(range,1.4/Math.tan(pit)+0.3):range; // a lowered muzzle meets the floor
  for(const o of team.ops){if(o===op||(o.low&&!op.low&&pit<0.15))continue;const dx=o.x+o.vel[0]*lead-op.x,dz=o.z+o.vel[1]*lead-op.z,al=dx*c+dz*s;if(al<0.12||al>reach)continue; // standing over a kneeling man is the high/low technique
    const band=op.flagT>0||op.tuckT>0?0.42:0.38; // hysteresis: once the muzzle is off him, it stays off until he is clearly out of the line
    if(Math.abs(-dx*s+dz*c)>band)continue;if(!los(op.x,op.z,o.x,o.z))continue;return o;}
  return null;
}

/* ---------- engagements and fire ---------- */
/* would this operator's barrel (in his current carry, without SUL) pass through a teammate's body,
   now or a quarter second ahead? */
function gunClash(op,yaw=op.h,pose=op.pose,hi=op.hi){
  const fl=floorOf(op.x);
  for(const lead of [0,0.25]){
    const x=op.x+op.vel[0]*lead,z=op.z+op.vel[1]*lead,c=Math.cos(yaw),s=Math.sin(yaw);
    for(const k of [0.25,0.45,RIFLE_LEN]){const q=rifleAt(pose,k,0,hi,0,op.shoulder??1);
      const bx=x+c*(q[0]+0.13)-s*q[1],bz=z+s*(q[0]+0.13)+c*q[1],by=q[2]-1.44+1.4;
      for(const o of team.ops){if(o===op||floorOf(o.x)!==fl)continue;
        const ox=o.x+o.vel[0]*lead,oz=o.z+o.vel[1]*lead;
        if(Math.hypot(bx-ox,bz-oz)<0.3&&by>0.3&&by<1.9)return true;}}}
  return false;
}
/* engagements */
function friendlyInLine(op,tx,tz){
  const dx=tx-op.x,dz=tz-op.z,L2=dx*dx+dz*dz;if(L2<1e-4)return null;
  for(const o of team.ops){if(o===op||floorOf(o.x)!==floorOf(op.x))continue;const t=((o.x-op.x)*dx+(o.z-op.z)*dz)/L2;if(t<0||t>1)continue;
    const px=op.x+dx*t-o.x,pz=op.z+dz*t-o.z;if(px*px+pz*pz>=0.25)continue;
    if(o.low&&!op.low){const lineY=1.45-0.11*t,head=chestW(o).ch[1]-wpos(o.x,o.z)[1]+0.32;if(lineY>head+0.08)continue;} // high over low
    return o;}
  return null;
}
function sidestep(op,e){
  if(op.wp.length)return;const a=Math.atan2(e.z-op.z,e.x-op.x),r=ridAt(op.x,op.z);
  for(const sg of [1,-1]){const px=op.x-Math.sin(a)*0.6*sg,pz=op.z+Math.cos(a)*0.6*sg,i=tileIdx(px,pz);
    if(i>=0&&!G.blocked[i]&&G.rid[i]===r){op.wp=[[px,pz]];op.spd=1.5;return;}}
}
function engageCheck(){
  const inTarget=o=>team.room&&ridAt(o.x,o.z)===team.room.id;
  for(const e of enemies){
    if(!e.alive||e.eng)continue;
    for(const op of team.ops){
      if(op.delay>0||op.aim||op.forceAim)continue;
      if(floorOf(op.x)!==floorOf(e.x))continue;
      const d=Math.hypot(e.x-op.x,e.z-op.z);if(d>13)continue;
      const a=Math.atan2(e.z-op.z,e.x-op.x);
      const cone=d<1.6?Math.PI:e.shootT>0?2.6:(inTarget(op)||op.pie||op.low||op.teeHigh)?1.2:0.85;
      if(Math.abs(angDiff(op.h,a))>cone)continue;
      if(!los(op.x,op.z,e.x,e.z))continue;
      engage(op,e);break;
    }
  }
}
function engage(op,e){
  e.eng={op,t:-rnd(0.12,0.3),shots:0,blockT:0,lost:0,stepped:false};op.aim=e;
  e.fireT=e.state!=='idle'&&Math.random()<0.35?e.eng.t+0.05:null;
  if(e.state==='idle')alertEnemy(e,0.2);
  if(!op.say)say(op,'CONTACT');
}
function forceEngage(e){
  let best=null,bd=1e9;
  for(const op of team.ops){if(op.aim||floorOf(op.x)!==floorOf(e.x))continue;const d=Math.hypot(e.x-op.x,e.z-op.z);
    if(los(op.x,op.z,e.x,e.z)&&d<bd){bd=d;best=op;}}
  if(best){engage(best,e);return true;}
  return false;
}
/* nobody can see him (behind the door leaf, behind furniture): the nearest man in the room moves to where he can */
function clearDeadSpace(e){
  const room=G.rooms[e.room];if(!room)return;
  const cand=team.ops.filter(o=>!o.aim&&!o.hunt&&ridAt(o.x,o.z)===room.id).sort((a,b)=>Math.hypot(a.x-e.x,a.z-e.z)-Math.hypot(b.x-e.x,b.z-e.z))[0];
  if(!cand)return;
  const inRoom=i=>G.rid[i]===room.id&&!G.blocked[i]; // stay inside: no detour out through another (closed) door
  const ci=tileIdx(cand.x,cand.z),{dist}=bfs(ci<0?0:ci,inRoom);
  let best=null,bd=1e9;
  for(const r of [1.3,1.9,2.6])for(let k=0;k<16;k++){const a=k/16*TAU,p=[e.x+Math.cos(a)*r,e.z+Math.sin(a)*r],i=tileIdx(p[0],p[1]);
    if(!standIdx(i,room.id)||dist[i]<0||!los(p[0],p[1],e.x,e.z)||friendlyInLine({x:p[0],z:p[1]},e.x,e.z))continue;
    const d=Math.hypot(p[0]-cand.x,p[1]-cand.z);if(d<bd){bd=d;best=p;}}
  if(!best)return;
  goTo(cand,best[0],best[1],1.3,inRoom);cand.hunt=e;cand.face=Math.atan2(e.z-best[1],e.x-best[0]);
  comms(cand.id,`DEAD SPACE · ${room.label}`);
}
const toW=(x,y,z)=>{const w=wpos(x,z);return [w[0],w[1]+y,w[2]];};
/* nobody fires through a wall: the muzzle itself must be on this side of the wall, with a clear line from it */
function muzzlePt(a,tx,tz){const h=Math.atan2(tz-a.z,tx-a.x);return [a.x+Math.cos(h)*RIFLE_LEN,a.z+Math.sin(h)*RIFLE_LEN];}
function muzzleClear(a,tx,tz){const m=muzzlePt(a,tx,tz);return los(a.x,a.z,m[0],m[1])&&los(m[0],m[1],tx,tz)&&los(a.x,a.z,tx,tz);}
function shot(from,tx,ty,tz,col){HOOK('shot',{from,tx,tz});
  const m=muzzle(from);tracers.push({a:m,b:toW(tx,ty,tz),life:0.11,max:0.11,col});flashes.push({p:m,life:0.07,col});
  noise(from.x,from.z,30);
}
function killEnemy(e,op){
  if(team.geo&&['pie','peek','stacked'].includes(team.state))team.geo.hot=true;
  e.alive=false;e.eng=null;e.wp=[];if(op.aim===e){op.aim=null;op.blocked=false;}kills++;
  shatter(e,op);
  say(op,pick(['ONE DOWN','HOSTILE DOWN']),'kill');
  const rm=G.rooms[e.room];if(rm)logs[logs.length-1].text+=' · '+rm.label;
}

/* ---------- team state machine and watchdog ---------- */
function secure(){
  setState('secure');team.secureT=0;team.room=null;team.geo=null;team.door=null;
  const tm=fmtT(simT);
  comms('TL',`BUILDING SECURE · ${G.F}F · ${roomsTotal} ROOMS · ${tm}`,'sys');
  $('bannerSub').textContent=`${G.F} FLOOR${G.F>1?'S':''} · ${roomsTotal} ROOMS · ${kills} DOWN · ${tm}`;
  $('banner').classList.add('on');
  team.ops.forEach(o=>{resetOp(o);o.face=o.h+rnd(-1.5,1.5);});
}
const fmtT=t=>pad(Math.floor(t/60))+':'+pad(Math.floor(t%60));

/* watchdog: never let the screensaver hang on an odd geometry or a stuck fight */
const LIMITS={move:35,stacked:8,breach:10,peek:7,pie:12,stun:8,entry:16,hold:14};
function watchdog(){HOOK('watchdog',{state:team.state});
  const room=team.room;team.wdCount=(team.wdCount||0)+1;
  team.events=[];
  team.ops.forEach(o=>{releaseAim(o);o.pie=false;o.forceAim=false;o.look=null;o.tap=null;o.tapPend=null;});
  if(room&&WORKING.includes(team.state)){
    for(const e of enemies)if(e.alive&&e.room===room.id){ // only a shooter with a clean line takes the shot
      const op=team.ops.filter(o=>floorOf(o.x)===floorOf(e.x)&&los(o.x,o.z,e.x,e.z)&&!friendlyInLine(o,e.x,e.z))
        .sort((a,b)=>Math.hypot(a.x-e.x,a.z-e.z)-Math.hypot(b.x-e.x,b.z-e.z))[0];
      e.eng=null;
      if(op){op.pose=1;op.hi=0;shot(op,e.x,1.3,e.z,'#ffe2a8');killEnemy(e,op);}
      else{e.alive=false;e.wp=[];kills++;shatter(e,team.ops[0]);comms('TL',`HOSTILE DOWN · ${room.label}`,'kill');}
    }
    if(team.state==='hold'){team.stateT=0;team.holdT=1.7;team.clearing=false;return;}
    snapMovers(3);
    if(PRE.includes(team.state)){if(team.door)team.door.breached=true;if(team.geo&&(team.geo.stair||team.geo.type==='tee')){setState('hold');team.holdT=0;return;}startEntry();return;}
    setState('hold');team.holdT=0;return;
  }
  if(team.state==='move'){snapMovers(1e9);team.stateT=0;return;} // stuck on the way to the stack: put them in their slots
  team.ops.forEach(o=>{o.wp=[];o.delay=0;});team.room=null;setState('plan');
}
function snapMovers(maxD){
  team.ops.forEach(o=>{
    if(o.wp.length&&!o.wp.some(w=>w.jump)){const l=o.wp[o.wp.length-1];if(Math.hypot(l[0]-o.x,l[1]-o.z)<maxD){o.x=l[0];o.z=l[1];o.body=null;}}
    else if(o.wp.length&&maxD>=1e8){const l=o.wp[o.wp.length-1];if(!l.jump){o.x=l[0];o.z=l[1];o.body=null;}} // across floors only as a last resort
    o.wp=[];o.delay=0;o.vel=[0,0];});
}
function stepTeam(dt){
  team.t+=dt;team.stateT+=dt;
  for(let i=team.events.length-1;i>=0;i--){const ev=team.events[i];if(team.t>=ev.t){team.events.splice(i,1);ev.fn();}}
  team.fireLogT-=dt;
  if(team.state!=='secure'){
    team.coverT-=dt;if(team.coverT<=0){team.coverT=0.2;assignCover();}
    team.engT-=dt;if(team.engT<=0){team.engT=0.05;engageCheck();}
  }
  if(LIMITS[team.state]&&team.stateT>LIMITS[team.state]){watchdog();return;}
  const arrived=()=>team.ops.every(o=>o.delay<=0&&o.wp.length===0);
  const fighting=()=>team.ops.some(o=>o.aim);
  switch(team.state){
    case 'plan':plan();break;
    case 'move':
      if(arrived()){setState('stacked');const g=team.geo;
        comms(1,g.stair?`STACKED · STAIRWELL · ${g.room.label}`:`STACKED · ${g.room.label} · ${g.type==='tee'?'2x2':g.fed}${g.type==='split'?' · SPLIT':''}${g.exp?' · EXPOSED':''}`);
        const O=team.ops;
        if(g.type==='split'){at(0.3,()=>tap(O[2],O[0],'UP'));at(0.6,()=>tap(O[3],O[1],'UP'));}
        else if(g.type==='tee'){at(0.55,()=>{tap(O[1],O[0],'UP');tap(O[3],O[2]);});}
        else if(g.stair){if(O.length>1)at(0.4,()=>tap(O[1],O[0],'UP'));}
        else for(let i=O.length-1;i>=1;i--){const k=O.length-1-i;at(0.25+k*0.3,()=>tap(O[i],O[i-1],'UP'));}
        const go=g.type==='split'||g.type==='tee'?1.15:[0,0.45,0.6,0.9,1.15][O.length];
        at(go,()=>{if(team.state==='stacked')preEntry();});}
      break;
    case 'breach':{
      const g=team.geo,b=g.breacher;if(!b)break;
      if(g.breachStage==='move'&&b.wp.length===0&&b.delay<=0){
        g.breachStage='fire';b.forceAim=true;
        const lp=g.latch,clear=()=>!segBlocked([b.x,b.z],lp,b,0.45);
        at(0.45,()=>{if(team.state!=='breach'||g.breachStage!=='fire')return;if(!clear()){kickBreach();return;}say(b,'BREACHING');shot(b,lp[0],1.0,lp[1],'#fff1c9');});
        at(0.67,()=>{if(team.state!=='breach'||g.breachStage!=='fire')return;if(!clear()){kickBreach();return;}shot(b,lp[0],1.06,lp[1],'#fff1c9');team.door.breached=true;team.door.slam=true;
          comms(b.id,`BALLISTIC BREACH · ${g.room.label}`);});
        at(0.95,()=>{if(team.state!=='breach'||g.breachStage!=='fire')return;b.forceAim=false;b.look=null;const sl=team.slots[b.id-1];goTo(b,sl[0],sl[1],1.8);});
        at(1.35,()=>{if(team.state==='breach'&&g.breachStage==='fire')afterBreach();});
      }
      break;}
    case 'peek':peekStep(dt);break; // rear security fighting does not stop the peek
    case 'pie':{
      const piers=team.ops.filter(o=>o.pie);
      if(team.stateT>7&&!fighting())piers.forEach(o=>{o.wp=[];}); // boxed in by the stack: take what was sliced so far
      if(team.geo.hot&&!fighting())piers.forEach(o=>{o.wp=[];}); // the pie found him and he is down: go now, don't keep slicing
      if(piers.every(o=>o.wp.length===0)&&!fighting()){team.geo.pieT+=dt;
        if(team.geo.pieT>0.5){piers.forEach(o=>o.pie=false);if(team.geo.stun)startStun();else startEntry();}}
      break;}
    case 'entry':
      team.entryT+=dt;
      if(team.stateT>10&&!fighting())team.ops.forEach(o=>{if(o.wp.length&&o.delay<=0)o.wp=[];}); // someone is hung up: hold where he stands
      if(arrived()&&!fighting()){setState('hold');team.holdT=0;}
      break;
    case 'hold':{
      team.holdT+=dt;const room=team.room;
      const alive=enemies.filter(e=>e.alive&&e.room===room.id);
      if(team.holdT>0.45)for(const e of alive.filter(e=>!e.eng)){
        if(forceEngage(e)){e.hideT=0;continue;}
        e.hideT=(e.hideT||0)+dt;if(e.hideT>0.5&&!team.ops.some(o=>o.hunt===e)){e.hideT=0;clearDeadSpace(e);}}
      if(!alive.length&&!team.clearing&&team.holdT>1.2&&seenFrac()<SEEN_OK)lookAround(dt);
      team.ops.forEach(o=>{if(!o.hunt)return;if(!o.hunt.alive){o.hunt=null;return;}
        // arrived but still no line on the dead space: give it up so the next attempt can pick another man or spot
        if(!o.wp.length&&!o.aim){o.huntT=(o.huntT||0)+dt;if(o.huntT>1.2){o.hunt=null;o.huntT=0;}}else o.huntT=0;});
      if(team.holdT>1.2&&!alive.length&&!team.clearing&&(seenFrac()>=SEEN_OK||(team.geo.seen&&team.geo.seen.noSpot&&team.holdT>3)||team.holdT>9)){
        team.clearing=true;HOOK('clear',{room,seen:seenFrac(),holdT:team.holdT});
        const inside=team.ops.filter(o=>ridAt(o.x,o.z)===room.id);
        inside.forEach((o,k)=>at(0.1+k*0.32,()=>say(o,'CLEAR')));
        const g=team.geo,d=team.door;
        at(0.1+inside.length*0.32+0.25,()=>{
          if(team.room!==room||team.state!=='hold')return;
          if(enemies.some(e=>e.alive&&e.room===room.id)){team.clearing=false;team.holdT=0.5;return;}
          room.cleared=true;team.lastRoom=room;
          say(team.ops[0],room.stair?'STAIRS CLEAR':room.hall?'HALL CLEAR':'ROOM CLEAR');
          if(d&&g&&!g.stair&&!d.arch){d.mark=[g.Px-g.nx*0.09+g.tx*g.s*0.72,g.Pz-g.nz*0.09+g.tz*g.s*0.72];d.markT=[g.tx,g.tz];comms(1,`${room.label} CLEAR · MARKED`,'clr');}
          else comms(1,`${room.label} CLEAR`,'clr');
          at(0.5,()=>{if(team.room!==room)return;team.clearing=false;team.room=null;team.ops.forEach(o=>{o.low=false;o.teeHigh=false;});setState('plan');});
        });
      }
      break;}
    case 'secure':
      team.secureT+=dt;if(team.secureT>7&&!fade.dir)newMap();break;
  }
}

/* ---------- one operator per frame: carry, lean, heading, movement ---------- */
/* carry positions (FM 3-06.11 / MCWP 3-35.3 muzzle discipline): returns [pose, high, SUL] targets
   pose: DIP (-0.4) muzzle depressed · 0 low ready · 0.55 compressed ready · 0.88 ready-up in the room · 1 shouldered
   - #1, a man on a danger area and rear security: compressed ready on their sector
   - the rest of the stack and the file: low ready, angled outboard (away from the man in front)
   - high ready only in the stairwell, where the threat is above
   - a teammate in the line: the muzzle angles outboard (outside the room) or is depressed (DIP); a man ~1-1.5 m
     away outside the room: high ready, outboard, over his head. SUL only within arm's length, or when the rifle would hit a body
   - never straight from high ready to SUL or back: the rifle passes through low ready (stepOp sequences it) */
function postureFor(op,noFlag=false){
  if(op.forceAim||op.pie)return [1,0,0];
  if(team.state==='peek'&&op===team.ops[0]&&!op.aim)return [0.8,0,0]; // peeking: gun stays up and close, the head does the looking
  if(op.aim)return op.blocked?[DIP,0,0]:[1,0,0];
  if(team.state==='secure')return [0,0,0];
  if(op.low||op.teeHigh)return [0.9,0,0];
  if(op.tap||op.tapPend)return [0.1,0,0]; // support hand off the gun for the squeeze: rifle hangs at low ready
  const inTgt=team.room&&ridAt(op.x,op.z)===team.room.id,st=team.state,stair=!!(team.geo&&team.geo.stair);
  const guard=op.id===1||op.cover||op.look||isRear(op);
  let p=0.1,hi=0;
  if(st==='hold'){p=team.clearing?(op.cover?0.55:0.1):(inTgt||op.cover)?0.88:0.55;}
  else if(st==='entry'){if(op.delay<=0&&(inTgt||op.wp.length))p=0.88;else if(guard)p=0.55;else if(stair){p=0.5;hi=1;}else p=0.1;}
  else if(PRE.includes(st)){if(guard)p=op.id===1||op.cover||op.look?0.6:0.55;else if(stair){p=0.5;hi=1;}else p=0.1;}
  else if(st==='move'){if(guard)p=0.55;else if(stair&&op.wp.length&&ridAt(op.x,op.z)>=0&&G.rooms[ridAt(op.x,op.z)].stair){p=0.5;hi=1;}else p=0.2;}
  if(op.flagT>0&&!noFlag){ // no clean line: muzzle depressed; outside, a man close on the muzzle: high ready, outboard, over his head;
    // one within arm's length: SUL (low or high would put the barrel into him)
    const inside=DIP_STATES.includes(st);
    return op.flagClose===2?[0.1,0,1]:op.flagClose===1&&!inside?[0.5,1,0]:[DIP,0,0];}
  return [p,hi,0];
}
/* lean: bend the upper body out past cover and keep the hips behind it — peeking, slicing the pie,
   or firing around the jamb. Toward the opening, away from the wall being used. */
function leanFor(op){
  const g=team.geo;if(!g||g.stair||!team.door||team.door.stair)return 0;
  if(!((op.peekLean||0)>0||op.pie||(op.aim&&!op.blocked)))return 0;
  const lat=(op.x-g.Px)*g.tx+(op.z-g.Pz)*g.tz,dep=(op.x-g.Px)*g.nx+(op.z-g.Pz)*g.nz;
  if(dep>0.1||dep<-1.8||Math.abs(lat)<0.25||Math.abs(lat)>1.5)return 0; // only at the jamb, from outside
  const b=op.body,y=b?b.yaw:op.h,sdx=-Math.sin(y),sdz=Math.cos(y),side=Math.sign(lat);
  const dir=Math.sign(-(sdx*g.tx+sdz*g.tz)*side)||1,amt=(op.peekLean||0)>0?op.peekLean:op.pie?0.24:0.2;
  return dir*amt;
}
function stepOp(op,dt){
  if(op.fireCool>0)op.fireCool-=dt;
  if(op.flagT>0)op.flagT-=dt;
  if(op.tapPend){const tp=op.tapPend;tp.t+=dt;const d=Math.hypot(op.x-tp.to.x,op.z-tp.to.z);
    if(op.aim||tp.t>1.6||d>1.9)op.tapPend=null;
    else if(d<=0.95||(tp.t>1.0&&d<=1.15)){if(tp.mv)op.wp=[];op.tapPend=null;op.tap={to:tp.to,t:0,T:0.55,pulsed:false};HOOK('tap',{from:op,to:tp.to});if(tp.text&&compromised)say(op,tp.text);}}
  if(op.tap){const tp=op.tap;tp.t+=dt;
    if(!tp.pulsed&&tp.t>tp.T*0.45){tp.pulsed=true;const sh=shoulderToward(tp.to,op);pulses.push({p:sh,t:0,f:floorOf(op.x)});
      if(tp.to.body){tp.to.body.leanV+=0.9;}}
    if(tp.t>=tp.T||op.aim)op.tap=null;}
  let crossing=null,hold=false,boost=1;
  if(op.delay>0){op.delay-=dt;hold=true;}
  else if(team.state==='move'&&op.wp.length&&!op.wp[0].jump){
    // danger-area crossing: stop short of an opening nobody is covering, then cross fast with the muzzle on it
    const w=op.wp[0],dx=w[0]-op.x,dz=w[1]-op.z,d=Math.hypot(dx,dz);
    if(d>0.05){const ax=op.x+dx/d*0.9,az=op.z+dz/d*0.9;
      for(const fd of team.frontier){if(fd===team.door||!fd.m)continue;
        const inNow=inFunnel(op.x,op.z,fd),inNext=inFunnel(ax,az,fd);
        const past=Math.abs(angDiff(Math.atan2(dz,dx),Math.atan2(fd.P[1]-op.z,fd.P[0]-op.x)))>1.9&&Math.hypot(fd.P[0]-op.x,fd.P[1]-op.z)>1.2;
        if((inNow||inNext)&&!past){crossing=fd;boost=1.5;
          // wait (at most 1.8 s per opening) for someone to cover it before stepping into its funnel
          const w=op.waited.get(fd)||0;
          if(!inNow&&!fd.covered&&op.cover!==fd&&w<1.8){hold=true;op.waited.set(fd,w+dt);if(op.id===1&&w<dt*0.5)say(op,'HOLD');}}}}
  }
  // a closed door on the way (between cleared rooms): the man at it stops, works the handle and opens it; nothing opens by itself
  op.reach=null;if(op.reachT>0){op.reachT-=dt;op.reach=op.reachP;}
  if(op.wp.length&&!op.aim&&!op.wp[0].jump){const w=op.wp[0],dx=w[0]-op.x,dz=w[1]-op.z,d=Math.hypot(dx,dz);
    if(d>0.05){const ci=tileIdx(op.x,op.z),ai=tileIdx(op.x+dx/d*0.7,op.z+dz/d*0.7);
      if(ci>=0&&ai>=0&&ai!==ci){const dr=G.doorByKey.get(dkey(ci,ai));
        if(dr&&!dr.arch&&!dr.stair&&!dr.breached&&!dr.eOpen&&!dr.tOpen&&dr!==team.door&&G.rooms[G.rid[dr.i1]].cleared&&G.rooms[G.rid[dr.i2]].cleared){hold=true;
          if(!dr.opener||dr.opener===op||simT-(dr.openerT||0)>0.15){dr.opener=op;dr.openerT=simT;op.reach=[dr.P[0],dr.P[1]];
            if(dr.locked&&!dr.openT)say(op,'BREACHING');dr.openT=(dr.openT||0)+dt;
            if(dr.openT>(dr.locked?0.8:0.4)){if(dr.locked){dr.slam=true;dr.locked=false;noise(dr.P[0],dr.P[1],12);}dr.tOpen=true;dr.opener=null;}}}}}}
  locomote(op,dt,boost,hold);
  if(op.repath){op.repath=false;const l=lastPt(op.wp);if(l){const here=ridAt(op.x,op.z),ok=i=>!G.blocked[i]&&(G.rooms[G.rid[i]].cleared||G.rid[i]===here||(team.room&&G.rid[i]===team.room.id));op.wp=pathTo(op.x,op.z,l[0],l[1],ok,true)||op.wp;} /* never re-route through a room nobody has cleared */}
  const sp=Math.hypot(op.vel[0],op.vel[1]);op.moving=sp>0.15;if(sp>0.1)op.mh=Math.atan2(op.vel[1],op.vel[0]);
  if(!op.wp.length&&op.waited.size)op.waited.clear();
  let want,free=false,why='face';
  if(op.aim){why='aim';want=Math.atan2(op.aim.z-op.z,op.aim.x-op.x);}
  else if(op.peekAt&&team.state==='peek'){why='peek';want=Math.atan2(op.peekAt[1]-op.z,op.peekAt[0]-op.x);}
  else if(op.pie){why='pie';const g=team.geo;want=Math.atan2(g.Pz-op.z,g.Px-op.x);}
  else if(op.tap&&!op.moving){why='tap'; // turn only enough to reach him with the support hand; the muzzle stays outboard, off him
    const t=op.tap.to,a=Math.atan2(t.z-op.z,t.x-op.x),d=angDiff(a,op.h);want=Math.abs(d)<0.8?a+(Math.sign(d)||1)*0.9:Math.abs(d)<=1.7?op.h:a+Math.sign(d)*1.5;}
  else if(op.alert&&simT<op.alert.t&&!(team.state==='entry'&&op.wp.length)){why='threat';want=Math.atan2(op.alert.p[1]-op.z,op.alert.p[0]-op.x);}
  else if(op.look){why='look';want=Math.atan2(op.look[1]-op.z,op.look[0]-op.x);}
  else if(crossing){why='crossing';want=Math.atan2(crossing.P[1]-op.z,crossing.P[0]-op.x);}
  else if(op.cover){why='cover';want=Math.atan2(op.cover.P[1]-op.z,op.cover.P[0]-op.x);}
  else if(team.state==='entry'&&op.entry&&op.delay<=0&&op.wp.length){ // sector while flowing in
    why='entry';const en=op.entry,T0=en.i<2?(en.pied||op.wp.length<=1?en.corner:en.front):en.farC;
    const u=team.ops.length===1?unseenTarget(op,null):unseenTarget(op,T0),T=u||T0;if(u)why='unseen';
    want=Math.atan2(T[1]-op.z,T[0]-op.x);}
  else if(op.moving&&team.state==='hold'&&!team.clearing&&op.looking){ // stepping to see the rest of the room
    const u=unseenTarget(op,null);why=u?'unseen':'travel';want=u?Math.atan2(u[1]-op.z,u[0]-op.x):op.mh;free=true;}
  else if(op.moving&&team.state==='move'&&op.id===1&&team.door&&!team.door.stair&&floorOf(op.x)===floorOf(team.door.P[0])&&
    Math.hypot(team.door.P[0]-op.x,team.door.P[1]-op.z)<3.5&&los(op.x,op.z,team.door.P[0]-team.door.m[0]*0.3,team.door.P[1]-team.door.m[1]*0.3)){
    why='door';want=Math.atan2(team.door.P[1]-op.z,team.door.P[0]-op.x);} // point man: muzzle on the door he is about to stack on
  else if(op.moving&&team.state==='move'){ // serpentine file: #1 front, #2/#3 split the sides, #4 rear security
    why='file';const rm=G.rooms[G.rid[tileIdx(op.x,op.z)]],hall=rm&&rm.hall;let off=0;
    if(isRear(op)){const behind=team.frontier.some(d=>d!==team.door&&!d.stair&&floorOf(d.P[0])===floorOf(op.x)&&Math.hypot(d.P[0]-op.x,d.P[1]-op.z)<8&&
        Math.abs(angDiff(op.mh,Math.atan2(d.P[1]-op.z,d.P[0]-op.x)))>1.9&&los(op.x,op.z,d.hold[0],d.hold[1]));
      off=behind&&Math.sin(simT*1.3+op.seed*7)>0.45?Math.PI:0.3;if(off===Math.PI)why='rear';}
    else if(op.id===2)off=hall?0.5:0.4;else if(op.id===3)off=hall?-0.5:-0.4;
    want=op.mh+off;free=true;}
  else if(op.moving){why='travel';want=op.mh;free=true;}
  else if(team.state==='hold'&&!team.clearing&&op.face!=null){ // from the point of domination: unseen areas first, then scan the sector
    const inside=team.room&&ridAt(op.x,op.z)===team.room.id,sec=[op.x+Math.cos(op.face)*3,op.z+Math.sin(op.face)*3];
    // a corner off his sector is a glance: look, then come back to the sector before the next one (no full turns)
    const back=op.glanceBack&&simT<op.glanceBack;
    let u=inside&&!back?unseenTarget(op,team.ops.length===1?null:sec):null;
    const lim=team.ops.length===1?2.6:1.9;
    if(u&&Math.abs(angDiff(op.face,Math.atan2(u[1]-op.z,u[0]-op.x)))>lim)u=null; // behind him: someone else's, or later
    if(u){const a=Math.atan2(u[1]-op.z,u[0]-op.x),off=Math.abs(angDiff(op.face,a));
      if(off>0.9){ // glancing: when that corner is seen (or after 0.8 s) the muzzle comes back to his sector first
        if(op.glK!=null&&op.glK!==op.uK||(op.glanceT=(op.glanceT||0)+dt)>0.8){op.glK=null;op.glanceT=0;op.glanceBack=simT+0.45;u=null;}
        else op.glK=op.uK;}
      else{op.glK=null;op.glanceT=0;}
      if(u){why='unseen';want=a;}}
    if(!u&&op.glanceBack&&simT<op.glanceBack){why='glance back';want=op.face;}
    else if(!u){why='scan';want=op.face+0.42*Math.sin(team.holdT*3.1+op.id)*Math.max(0,1-team.holdT/2.6);}free=true;}
  else{want=op.face!=null?op.face:op.h;free=true;}
  op.why=why;
  const setFace=why==='face'&&PRE.includes(team.state)&&!op.moving; // his outboard angle was picked clear of the stack
  // muzzle management. In DIP_STATES a teammate crossing the muzzle means: muzzle down now, keep the sector, bring it
  // back up when he is past. Elsewhere the muzzle angles outboard off him; if it can't, dip / high ready / SUL by distance.
  if(!op.aim&&!op.forceAim&&!op.pie){
    const inRoom=DIP_STATES.includes(team.state);
    const [cp,ch]=inRoom?[Math.max(0.88,op.pose),0]:postureFor(op,true); // judge against the carry he is in (a lowered muzzle meets the floor before it reaches far teammates)
    const F=(y,l=0)=>flagAt(op,y,cp,ch,9,l,true);
    const crossNow=F(op.h)||F(op.h,0.3),crossNext=F(want),mate=crossNow||crossNext; // including where he'll be in 0.3 s
    if(mate){
      if(inRoom){op.flagT=0.45;const dm=Math.hypot(mate.x-op.x,mate.z-op.z);op.flagClose=dm<0.9?2:0;} // in the room: dip (SUL only at arm's length)
      else{let ok=null;for(const a of free||op.cover||crossing||op.look?[0.15,-0.15,0.3,-0.3,0.5,-0.5,0.7,-0.7]:[0.15,-0.15,0.3,-0.3])if(!F(want+a)){ok=a;break;}
        if(ok!==null&&!setFace){want+=ok;if(crossNow&&op.tuck<0.5){op.flagT=0.35;op.flagClose=Math.hypot(crossNow.x-op.x,crossNow.z-op.z)<0.85?2:0;}} // angle the muzzle off him (dipping while it swings)
        else{const dm=Math.hypot(mate.x-op.x,mate.z-op.z),h=op.tuck>0.5||op.hi>0.5?0.2:0;op.flagT=0.8;op.flagClose=dm<1.45+h?(dm<0.95+h&&gunClash(op,want,0.5,1)?2:1):0;}} // close: high ready outboard if the rifle clears him up there // nowhere to point it: dip; SUL only if he is right on the muzzle
    }
  }
  // the rifle would run into a teammate's body: angle it away first; SUL only if there is nowhere to point it
  if(!setFace&&!op.aim&&!op.forceAim&&!op.pie&&!op.low&&(free||op.cover||op.look||team.state!=='entry')&&gunClash(op,want)){
    for(const a of [0.3,-0.3,0.55,-0.55,0.8,-0.8])if(!gunClash(op,want+a)&&!flagAt(op,want+a,op.pose,op.hi,9,0,true)){want+=a;break;}}
  [op.h,op.yawV]=springA(op.h,op.yawV,want,op.aim?15:8.5,dt);
  let [pt,ht,tt]=postureFor(op);
  if(!op.aim&&!op.pie&&!op.forceAim&&!op.low&&!op.teeHigh&&(tt>0.5||gunClash(op))){if(op.tuckT<=0&&simT-(op.sulOut||-9)<1.0)op.sulLong=1.2; // came right back: stay tucked longer
    op.tuckT=Math.max(op.tuckT,tt>0.5?0.3:(op.sulLong||0.5));}
  else if(op.tuckT>0){op.tuckT-=dt;if(op.tuckT<=0){op.sulOut=simT;op.sulLong=0;}}
  if(op.aim||op.pie||op.forceAim)op.tuckT=0;
  tt=op.tuckT>0?1:0;if(tt)ht=0;
  // high ready <-> SUL goes through low ready: finish one before starting the other
  if(tt&&op.hi>0.12){tt=0;ht=0;pt=Math.min(pt,0.1);}
  if(ht>0.5&&op.tuck>0.12){ht=0;pt=Math.min(pt,0.1);}
  [op.pose,op.poseV]=spring(op.pose,op.poseV,pt,pt<op.pose-0.2?22:op.aim||op.forceAim?14:8,dt); // muzzle comes down faster than it goes up
  [op.hi,op.hiV]=spring(op.hi,op.hiV,ht,ht<op.hi?14:8,dt);
  [op.tuck,op.tuckV]=spring(op.tuck,op.tuckV,tt,11,dt);
  op.relaxed=team.state==='secure';
  {const sp=Math.hypot(op.vel[0],op.vel[1]);op.stepNT=(op.stepNT||0)-dt;if(sp>0.6&&op.stepNT<=0){op.stepNT=0.45;noise(op.x,op.z,sp>1.6?3:1.6);}} // footsteps
  op.rollT=leanFor(op);
  // at the jamb, a left-hand corner is worked from the left shoulder (FM 3-06.11: "a right-handed shooter should fire
  // left-handed around the left corner"); never switched while flowing through the door
  const atJamb=op.pie||(op.peekLean||0)>0||(op.aim&&!op.moving&&op.rollT);
  [op.shoulder,op.shV]=spring(op.shoulder??1,op.shV||0,atJamb&&op.rollT<-0.05&&team.state!=='entry'?-1:1,9,dt);
  op.bladeT=atJamb&&(op.pie||(op.peekLean||0)>0)?-Math.sign(op.rollT)*0.5:0; // hips turned away from the opening: a narrow silhouette
  animBody(op,dt);
  if(op.say){op.sayT+=dt;if(op.sayT>SAY_T)op.say=null;}
}

/* ---------- enemy AI ---------- */
function alertEnemy(e,delay){
  if(e.state!=='idle')return;e.state='alerted';e.alertT=delay;e.fireCD=rnd(0.35,0.7);
  if(!compromised){compromised=true;comms('TL','COMPROMISED · HOSTILES MOVING','alert');}
}
/* hearing, the hostiles' side: a noise is heard within r (walls muffle it); idle men wake, alert men turn to it */
function noise(x,z,r){for(const e of enemies){if(!e.alive)continue;
  const d=wdist(e.x,e.z,x,z)*(floorOf(e.x)===floorOf(x)&&los(e.x,e.z,x,z)?1:1.8);if(d>=r)continue;
  if(e.state==='idle')alertEnemy(e,rnd(0.35,1.3)+d*0.03);else{e.heardP=[x,z];e.heardT=simT;}}}
function perceive(e){
  let best=null,bd=1e9;const cone=e.state==='idle'?1.15:2.8;
  for(const o of team.ops){if(floorOf(o.x)!==floorOf(e.x))continue;const d=Math.hypot(o.x-e.x,o.z-e.z);if(d>12||d>=bd)continue;
    if(d>1.5&&Math.abs(angDiff(e.h,Math.atan2(o.z-e.z,o.x-e.x)))>cone)continue;
    if(!los(e.x,e.z,o.x,o.z))continue;best=o;bd=d;}
  return best;
}
function threatDoorOf(room){
  const L=team.ops[0];let best=null,bd=1e9;
  for(const d of G.doors){if(d.stair||(G.rid[d.i1]!==room.id&&G.rid[d.i2]!==room.id))continue;
    const dd=Math.hypot(d.P[0]-L.x,d.P[1]-L.z);if(dd<bd){bd=dd;best=d;}}
  return best;
}
/* a corner out of the fatal funnel of the likely entry door, not already taken by another hostile */
function ambushSpot(room,self){
  const td=threatDoorOf(room);let best=null,bs=-1e9;
  const taken=enemies.filter(o=>o!==self&&o.alive).map(o=>o.goal&&o.state==='moving'&&ridAt(o.goal[0],o.goal[1])===room.id?o.goal:[o.x,o.z]);
  let nx=0,nz=0;if(td){const ri_=G.rid[td.i1]===room.id?td.i1:td.i2;const c=tc(ri_);nx=(c[0]-td.P[0])*2;nz=(c[1]-td.P[1])*2;}
  for(let y=room.y;y<room.y+room.h;y++)for(let x=room.x;x<room.x+room.w;x++){
    const i=y*G.TW+x;if(G.blocked[i]||G.rampOf[i]>=0)continue;const cx=x+0.5,cz=y+0.5;
    if(room.doorPts.some(p=>Math.hypot(p[0]-cx,p[1]-cz)<1.3))continue;
    if(taken.some(p=>Math.hypot(p[0]-cx,p[1]-cz)<1.1))continue;
    const ex=x===room.x||x===room.x+room.w-1,ez=y===room.y||y===room.y+room.h-1;
    let sc=(ex&&ez?2:ex||ez?0.8:0)+Math.random()*1.2;
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const j=(y+dz)*G.TW+x+dx;if(inB(x+dx,y+dz)&&G.blocked[j]&&G.rid[j]===room.id)sc+=0.9;}
    if(td){const dx=cx-td.P[0],dz=cz-td.P[1],along=dx*nx+dz*nz,lat=Math.abs(dx*nz-dz*nx);
      sc+=Math.min(Math.hypot(dx,dz),5)*0.35+Math.min(lat,3)*0.5-(lat<0.9&&along>0?2.5:0);}
    if(sc>bs){bs=sc;best=[cx+rnd(-0.12,0.12),cz+rnd(-0.12,0.12)];}
  }
  return {pt:best,door:td};
}
function chooseMode(e){
  const room=G.rooms[e.room];e.peek=null;
  if(!room||room.id<=1||room.cleared){e.state='set';e.setT=rnd(3,6);return;}
  const r=Math.random(),L=team.ops[0];
  if(r<0.3){ // push: move up to a doorway on the team's frontier and peek out
    const si=tileIdx(e.x,e.z),{dist}=bfs(si,enemyAllowed);let best=null,bd=1e9;
    for(const d of team.frontier){if(d.stair||d===team.door&&INSIDE.includes(team.state))continue;
      if(enemies.some(o=>o!==e&&o.alive&&o.peek===d))continue;
      const ui=enemyAllowed(d.i1)?d.i1:enemyAllowed(d.i2)?d.i2:-1;if(ui<0||dist[ui]<0)continue;
      if(dist[ui]<bd){bd=dist[ui];best={d,ui};}}
    if(best&&bd<16){const d=best.d,uc=tc(best.ui);
      const px=d.P[0]+(uc[0]-d.P[0])*1.5,pz=d.P[1]+(uc[1]-d.P[1])*1.5;
      if(eGoTo(e,px,pz,2.0)){e.state='moving';e.peek=d;e.face=Math.atan2(d.P[1]-pz,d.P[0]-px);return;}}
  }
  if(r<0.62){ // fall back deeper into the building (possibly upstairs)
    const opts=[];
    for(const d of G.doors){const r1=G.rid[d.i1],r2=G.rid[d.i2],o=r1===room.id?r2:r2===room.id?r1:-1;if(o<0)continue;
      const ro=G.rooms[o];if(!ro||ro.id<=1||ro.cleared||(team.room===ro&&INSIDE.includes(team.state)))continue;opts.push(ro);}
    const far=ro=>wdist(ro.x+ro.w/2,ro.y+ro.h/2,L.x,L.z);
    const here=far(room);
    const cand=opts.filter(ro=>far(ro)>here-0.5).sort((a,b)=>far(b)-far(a));
    if(cand.length){const ro=cand[0],sp=ambushSpot(ro,e);
      if(sp.pt&&eGoTo(e,sp.pt[0],sp.pt[1],2.1)){e.state='moving';
        e.face=sp.door?Math.atan2(sp.door.P[1]-sp.pt[1],sp.door.P[0]-sp.pt[0]):e.h;return;}}
  }
  const sp=ambushSpot(room,e); // hold in place: set up on the likely entry door
  if(sp.pt&&eGoTo(e,sp.pt[0],sp.pt[1],1.7)){e.state='moving';
    e.face=sp.door?Math.atan2(sp.door.P[1]-sp.pt[1],sp.door.P[0]-sp.pt[0]):e.h;return;}
  e.state='set';e.setT=rnd(6,12);
}
/* fire from an uncleared room makes it the priority: the team shifts to it instead of following the original plan */
function contact(e){
  const r=G.rooms[e.room];if(!r||r.cleared||r.id<=1)return;
  r.contactT=simT;r.contactP=[e.x,e.z];team.contact=r;
  if(team.state==='move'&&team.room!==r&&(team.shiftFor!==r||simT-(team.shiftT||0)>8)&&(team.frontier||[]).some(d=>G.rooms[G.rid[d.i1]]===r||G.rooms[G.rid[d.i2]]===r)){
    team.shiftFor=r;team.shiftT=simT;comms('TL',`CONTACT ${r.label} · SHIFT`,'alert');setState('plan');}
}
/* what the team knows about a hostile: seen now, reported by a peek, heard moving, or firing */
function knownThreat(e){return simT-(e.spottedT||-9)<4||simT-(e.teamHeardT||-9)<5||e.shootT>0||
  team.ops.some(o=>floorOf(o.x)===floorOf(e.x)&&los(o.x,o.z,e.x,e.z));}
/* hearing, the team's side: a hostile moving (louder running) or firing is heard, muffled through walls.
   The nearest free man turns to the sound and calls it; the room goes up the plan (like contact, weaker). */
function hearing(dt){
  team.hearT=(team.hearT||0)-dt;if(team.hearT>0)return;team.hearT=0.25;
  for(const e of enemies){if(!e.alive)continue;const sp=Math.hypot(e.vel[0],e.vel[1]),loud=e.shootT>0?30:sp>1.5?6:sp>0.4?3.5:0;if(!loud)continue;
    let best=null,bd=1e9;for(const o of team.ops){if(floorOf(o.x)!==floorOf(e.x))continue;const d=Math.hypot(o.x-e.x,o.z-e.z)*(los(o.x,o.z,e.x,e.z)?1:1.8);if(d<bd){bd=d;best=o;}}
    if(!best||bd>loud)continue;
    const fresh=simT-(e.teamHeardT||-9)>3;if(fresh)HOOK('heard',{e,d:bd});e.teamHeardT=simT;e.heardAt=[e.x+rnd(-0.5,0.5),e.z+rnd(-0.5,0.5)];
    const r=G.rooms[e.room];if(r&&!r.cleared){r.heardT=simT;r.heardP=e.heardAt;}
    if(fresh&&e.shootT<=0&&!best.aim){const ls=team.ops.filter(o=>!o.aim&&!o.cover&&!isRear(o)&&floorOf(o.x)===floorOf(e.x)&&!(team.state==='entry'&&o.wp.length));
      for(const o of ls)o.alert={p:e.heardAt,t:simT+1.2};
      if(simT-(team.moveCallT||-9)>4){team.moveCallT=simT;say(best,'MOVEMENT');}}}
}
/* react to contact (the man being fired on): return fire if he can see the shooter; if he is standing in the open
   and a step takes him out of the line of fire, he takes it — backing off while he shoots if that is the only way.
   The rest orient on the threat; rear security and men on a danger area keep their sectors. Not during the entry
   flow: there the entry itself is the answer. */
function reactToContact(e,op){
  const fl=floorOf(e.x);if(floorOf(op.x)!==fl)return;
  if(!op.aim&&!e.eng&&los(op.x,op.z,e.x,e.z))engage(op,e);
  if(['hold','stacked'].includes(team.state)&&!op.wp.length&&!op.low&&!(op.offLineT>simT)){
    const away=Math.atan2(op.z-e.z,op.x-e.x),here=ridAt(op.x,op.z);let best=null;
    for(const [r,da] of [[0.8,1.57],[0.8,-1.57],[0.7,1.05],[0.7,-1.05],[0.8,0]]){const a=away+da,p=[op.x+Math.cos(a)*r,op.z+Math.sin(a)*r];
      if(!standAt(p,here)||team.ops.some(o=>o!==op&&Math.hypot(o.x-p[0],o.z-p[1])<0.55))continue;
      const covered=!los(e.x,e.z,p[0],p[1]);if(covered||da===0){const sc=covered?0:1;if(!best||sc<best.sc)best={p,sc};}}
    if(best&&(best.sc===0||op.aim)){goTo(op,best.p[0],best.p[1],best.sc?1.0:1.8);op.delay=0;op.offLineT=simT+2.5;}}
  for(const o of team.ops){if(o===op||o.aim||o.cover||isRear(o)||floorOf(o.x)!==fl)continue;if(team.state==='entry'&&o.wp.length)continue;o.alert={p:[e.x,e.z],t:simT+1.8};}
}
function enemyShot(e,op){HOOK('eshot',{e,op});
  const c=Math.cos(e.h),s=Math.sin(e.h),m=muzzle(e),mp=muzzlePt(e,op.x,op.z);
  const side=(Math.random()<0.5?-1:1)*rnd(0.55,1.1);
  const ax=op.x-s*side-mp[0],az=op.z+c*side-mp[1],ang=Math.atan2(az,ax),L=rayLen(mp[0],mp[1],ang,Math.hypot(ax,az)*1.8); // the round stops at the first wall
  tracers.push({a:m,b:toW(mp[0]+Math.cos(ang)*L,rnd(1.2,1.6),mp[1]+Math.sin(ang)*L),life:0.1,max:0.1,col:'#ff8a7a'});
  flashes.push({p:m,life:0.07,col:'#ff8a7a'});
  e.shootT=0.9;noise(e.x,e.z,30);contact(e);
  reactToContact(e,op);
  if(!(op.fireCool>0)){op.fireCool=4;const log=team.fireLogT<=0;if(log)team.fireLogT=6;say(op,'TAKING FIRE',log?'alert':false);}
}
function engagedStep(e,dt){
  const g=e.eng,op=g.op;
  if(op.aim!==e){e.eng=null;return;}
  g.t+=dt;
  const a=Math.atan2(op.z-e.z,op.x-e.x);if(!(e.stunT>0))e.h+=clamp(angDiff(e.h,a),-5*dt,5*dt);
  if(!los(op.x,op.z,e.x,e.z)){g.lost+=dt;if(g.lost>0.35)releaseAim(op);return;}
  g.lost=0;
  if(e.fireT!=null&&g.t>=e.fireT&&e.pose>0.8&&!(e.stunT>0)&&muzzleClear(e,op.x,op.z)){e.fireT=null;enemyShot(e,op);}
  if(g.t<0)return;
  op.blocked=!!friendlyInLine(op,e.x,e.z);
  if(op.blocked){ // muzzle discipline: hold fire; shift for a clear line, or pass the target to someone who has one
    g.blockT+=dt;g.t=0;
    if(g.blockT>0.3&&!g.stepped){g.stepped=true;sidestep(op,e);if(!op.say)say(op,'SHIFTING');}
    if(g.blockT>0.8){const alt=team.ops.find(o=>o!==op&&!o.aim&&o.delay<=0&&floorOf(o.x)===floorOf(e.x)&&los(o.x,o.z,e.x,e.z)&&!friendlyInLine(o,e.x,e.z));
      if(alt){releaseAim(op);engage(alt,e);return;}}
    if(g.blockT>1.6){g.blockT=0.31;g.stepped=false;}
    return;
  }
  if(op.pose<0.9){g.t=0;return;} // weapon still coming up to the shoulder
  if(!muzzleClear(op,e.x,e.z)){g.t=Math.min(g.t,0);if(!g.stepped){g.stepped=true;sidestep(op,e);}return;} // muzzle against the jamb: step off it first
  if(g.shots===0){shot(op,e.x+rnd(-.05,.05),1.34,e.z+rnd(-.05,.05),'#ffe2a8');g.shots=1;g.t=0;}
  else if(g.t>=0.14){shot(op,e.x+rnd(-.05,.05),1.42,e.z+rnd(-.05,.05),'#ffe2a8');killEnemy(e,op);}
}
/* ---------- bodies vs walls, closed doors and door leaves; spacing ---------- */
/* a closed door is a wall for bodies (paths may still run through it: someone has to open it first) */
function shut(i1,i2){const d=G.doorByKey.get(dkey(i1,i2));return !!d&&!d.arch&&!d.stair&&d.o<0.5;}
function passable(x,y,dx,dy){if(!open(x,y,dx,dy))return false;const i=y*G.TW+x;return !shut(i,i+dy*G.TW+dx);}
function stepPassable(ci,pi){const x=ci%G.TW,y=(ci/G.TW)|0,dx=(pi%G.TW)-x,dy=((pi/G.TW)|0)-y;if(Math.abs(dx)>1||Math.abs(dy)>1)return false;
  if(!dx&&!dy)return true;if(!dx||!dy)return passable(x,y,dx,dy);
  return (passable(x,y,dx,0)&&passable(x+dx,y,0,dy))||(passable(x,y,0,dy)&&passable(x,y+dy,dx,0));}
function wallClamp(e){
  const gx=Math.floor(e.x),gz=Math.floor(e.z);if(!inB(gx,gz))return;
  if(e.x-gx<0.22&&!passable(gx,gz,-1,0))e.x=gx+0.22;if(e.x-gx>0.78&&!passable(gx,gz,1,0))e.x=gx+0.78;
  if(e.z-gz<0.22&&!passable(gx,gz,0,-1))e.z=gz+0.22;if(e.z-gz>0.78&&!passable(gx,gz,0,1))e.z=gz+0.78;
}
/* door leaves are solid: a body is kept a shoulder's width off an open or swinging leaf */
function leafSeg(d){const [x1,z1]=d.hinge,[ux,uz]=d.hdir,[wx,wz]=d.sw,th=d.o*Math.PI*0.48;
  if(d.pocket){const k=d.o*0.9;return [x1+ux*(0.05-k),z1+uz*(0.05-k),x1+ux*(0.93-k),z1+uz*(0.93-k)];} // slides into the wall
  const hx=x1+ux*0.05,hz=z1+uz*0.05;return [hx,hz,hx+(ux*Math.cos(th)+wx*Math.sin(th))*0.88,hz+(uz*Math.cos(th)+wz*Math.sin(th))*0.88];}
function leafPush(a){
  const R=0.22;
  for(const d of G.leafBy.values()){if(d.o<0.05)continue;const s=leafSeg(d);
    if(Math.abs(s[0]-a.x)>1.3||Math.abs(s[1]-a.z)>1.3)continue;
    const dx=s[2]-s[0],dz=s[3]-s[1],L=dx*dx+dz*dz||1e-9;let t=((a.x-s[0])*dx+(a.z-s[1])*dz)/L;t=clamp(t,0,1);
    const cx=s[0]+dx*t,cz=s[1]+dz*t;let ox=a.x-cx,oz=a.z-cz,dd=Math.hypot(ox,oz);if(dd>=R)continue;
    if(dd<1e-4){ox=-dz;oz=dx;dd=Math.hypot(ox,oz);} // exactly on it: step off to one side
    const k=(R-dd)/dd,nx=a.x+ox*k,nz=a.z+oz*k,ci=tileIdx(a.x,a.z),ni=tileIdx(nx,nz);
    if(ni<0||(ni!==ci&&(G.blocked[ni]||!stepPassable(ci,ni))))continue;a.x=nx;a.z=nz;}
}
/* keep bodies apart: hostiles give way to each other and to the team */
function separate(dt){
  const live=enemies.filter(e=>e.alive);
  for(const e of live){let px=0,pz=0;
    for(const o of live){if(o===e)continue;const dx=e.x-o.x,dz=e.z-o.z,d=Math.hypot(dx,dz);
      if(d<1e-3){px+=rnd(-0.2,0.2);pz+=rnd(-0.2,0.2);}else if(d<0.72){const k=(0.72-d)/d;px+=dx*k;pz+=dz*k;}}
    for(const o of team.ops){const dx=e.x-o.x,dz=e.z-o.z,d=Math.hypot(dx,dz);
      if(d<1e-3){px+=0.2;}else if(d<0.78){const k=(0.78-d)/d*1.5;px+=dx*k;pz+=dz*k;}}
    if(!px&&!pz)continue;
    const m=Math.min(1,dt*7),nx=e.x+px*m,nz=e.z+pz*m,ci=tileIdx(e.x,e.z),ni=tileIdx(nx,nz);
    if(ni<0||G.blocked[ni])continue;
    if(ni!==ci){if(!stepPassable(ci,ni))continue;if(G.rid[ni]!==G.rid[ci]&&!enemyAllowed(ni))continue;}
    e.x=nx;e.z=nz;wallClamp(e);
  }
}
function stepEnemies(dt){
  for(const e of enemies){
    if(!e.alive)continue;
    const ti=tileIdx(e.x,e.z);if(ti>=0)e.room=G.rid[ti];
    e.shootT=Math.max(0,e.shootT-dt);
    const stunned=e.stunT>0;if(stunned)e.stunT-=dt;
    {const pt=stunned?0:e.eng||e.tgt?1:e.state==='idle'?0.05:0.45;[e.pose,e.poseV]=spring(e.pose,e.poseV,pt,6,dt);}
    let moved=false;
    if(e.eng)engagedStep(e,dt);
    else if(stunned){e.h+=Math.sin(simT*9+e.seed)*1.4*dt;e.tgt=null;}
    else{
      e.percT-=dt;if(e.percT<=0){e.percT=0.1;e.tgt=perceive(e);}
      const tgt=e.tgt;
      if(e.state==='idle'){if(tgt)alertEnemy(e,0.25);e.h+=Math.sin(simT*0.6+e.seed)*0.12*dt;}
      else{
        if(e.state==='alerted'){e.alertT-=dt;if(e.alertT<=0&&!tgt)chooseMode(e);}
        if(!tgt&&e.heardP&&simT-e.heardT<3&&!e.wp.length){const a=Math.atan2(e.heardP[1]-e.z,e.heardP[0]-e.x);e.h+=clamp(angDiff(e.h,a),-3*dt,3*dt);} // turn to the sound
        if(tgt){ // fight from where they stand
          const a=Math.atan2(tgt.z-e.z,tgt.x-e.x);e.h+=clamp(angDiff(e.h,a),-4.5*dt,4.5*dt);
          e.fireCD-=dt;
          if(e.fireCD<=0&&e.pose>=0.9&&Math.abs(angDiff(e.h,a))<0.3&&muzzleClear(e,tgt.x,tgt.z)){enemyShot(e,tgt);e.burst--;
            if(e.burst>0)e.fireCD=0.11;else{e.burst=ri(2,3);e.fireCD=rnd(1.0,1.9);}}
        }else if(e.wp.length){
          moved=true;
          const w=e.wp[0];
          if(!w.jump){const dx=w[0]-e.x,dz=w[1]-e.z,d=Math.hypot(dx,dz),ci=tileIdx(e.x,e.z);
            if(d>0.05){const ai=tileIdx(e.x+dx/d*0.7,e.z+dz/d*0.7);if(ai>=0&&ai!==ci){const dr=G.doorByKey.get(dkey(ci,ai));if(dr&&!dr.arch){dr.eOpen=true;dr.locked=false;if(dr.o<0.6)e.doorWait=true;}}}}
          const res=e.doorWait?(e.doorWait=false,e.vel=[0,0],0):locomote(e,dt,1,false,enemyAllowed); // the leaf has to be open before he steps through
          if(res<0){e.wp=[];e.state='alerted';e.alertT=rnd(0.6,1.4);}
          if(e.repath){e.repath=false;const l=lastPt(e.wp);if(l)e.wp=pathTo(e.x,e.z,l[0],l[1],enemyAllowed,true)||[];}
          const sp=Math.hypot(e.vel[0],e.vel[1]);if(sp>0.1)e.h+=clamp(angDiff(e.h,Math.atan2(e.vel[1],e.vel[0])),-7*dt,7*dt);
          if(!e.wp.length&&e.state==='moving'){e.state='set';e.setT=rnd(8,16);if(e.peek){e.peek.eOpen=true;e.peek.locked=false;}}
        }else{
          if(e.face!=null)e.h+=clamp(angDiff(e.h,e.face),-3*dt,3*dt);
          if(e.state==='moving'){e.state='set';e.setT=rnd(6,12);}
          if(e.state==='set'){e.setT-=dt;if(e.setT<=0){e.setT=rnd(8,16);if(Math.random()<0.45)chooseMode(e);}}
        }
      }
    }
    if(!moved)locomote(e,dt,1,true);
    e.relaxed=e.state==='idle';
    animBody(e,dt);
  }
  separate(dt);
}
/* teammates keep a body's width apart too; walls and furniture still win */
function separateOps(dt){
  const ops=team.ops;
  for(let i=0;i<ops.length;i++)for(let j=i+1;j<ops.length;j++){
    const a=ops[i],b=ops[j];if(floorOf(a.x)!==floorOf(b.x))continue;
    let dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);const R=0.55;if(d>=R)continue;
    if(d<1e-3){dx=Math.cos(a.h+1.57)*1e-3;dz=Math.sin(a.h+1.57)*1e-3;d=1e-3;}
    const push=(R-d)*Math.min(1,dt*9)*0.5,ux=dx/d,uz=dz/d;
    for(const [o,sg] of [[a,-1],[b,1]]){const nx=o.x+ux*push*sg,nz=o.z+uz*push*sg,ci=tileIdx(o.x,o.z),ni=tileIdx(nx,nz);
      if(ni<0||(ni!==ci&&(G.blocked[ni]||!stepPassable(ci,ni))))continue;o.x=nx;o.z=nz;}
  }
  for(const o of ops)for(const e of enemies){if(!e.alive||floorOf(e.x)!==floorOf(o.x))continue;
    const dx=o.x-e.x,dz=o.z-e.z,d=Math.hypot(dx,dz);if(d>=0.6||d<1e-3)continue;
    const k=(0.6-d)/d*Math.min(1,dt*6)*0.35,nx=o.x+dx*k,nz=o.z+dz*k,ci=tileIdx(o.x,o.z),ni=tileIdx(nx,nz);
    if(ni<0||(ni!==ci&&(G.blocked[ni]||!stepPassable(ci,ni))))continue;o.x=nx;o.z=nz;}
}

/* ---------- motion: steering, springs, planted feet, balance ---------- */
function spring(x,v,t,w,dt){const f=1+2*dt*w,hoo=dt*w*w,hhoo=dt*hoo,det=1/(f+hhoo);return [(f*x+dt*v+hhoo*t)*det,(v+hoo*(t-x))*det];}
function springA(x,v,t,w,dt){return spring(x,v,x+angDiff(x,t),w,dt);}
/* follow the waypoint list with acceleration limits and rounded corners; returns -1 if a tile is refused */
function lastPt(wp){for(let i=wp.length-1;i>=0;i--)if(!wp[i].jump)return wp[i];return null;}
function locomote(a,dt,mul=1,hold=false,allow=null){
  let dvx=0,dvz=0;
  while(!hold&&a.wp.length){
    const w=a.wp[0];
    if(w.jump){const dx=w.jump[0]-a.x,dz=w.jump[1]-a.z;a.x=w.jump[0];a.z=w.jump[1];
      if(a.body)for(const f of a.body.feet){f.p[0]+=dx;f.p[1]+=dz;if(f.from){f.from[0]+=dx;f.from[1]+=dz;f.to[0]+=dx;f.to[1]+=dz;}}
      a.wp.shift();a.prog=null;continue;}
    const dx=w[0]-a.x,dz=w[1]-a.z,d=Math.hypot(dx,dz),last=a.wp.length===1,beforeJump=!last&&!!a.wp[1].jump;
    const sp=Math.hypot(a.vel[0],a.vel[1]);
    const next=()=>{a.wp.shift();a.prog=null;a.arriveT=0;};
    if(beforeJump&&d<0.2){next();continue;}
    if(!last&&!beforeJump&&d<Math.min(0.35,0.1+a.spd*0.1)){next();continue;}
    if(last&&(d<0.02||(d<0.07&&sp<0.35))){a.x=w[0];a.z=w[1];next();continue;}
    if(last&&d<0.35){a.arriveT=(a.arriveT||0)+dt;if(a.arriveT>1.2){next();continue;}} // jostled by a teammate: close enough
    // progress watch: a waypoint that stops getting closer (pushed around, or a bad corner) is dropped or re-pathed
    if(!a.prog||a.prog.w!==w)a.prog={w,best:d,t:0};
    if(d<a.prog.best-0.02){a.prog.best=d;a.prog.t=0;}else a.prog.t+=dt;
    if(a.prog.t>0.7){if(!last&&!beforeJump&&d<1.2){next();continue;}a.repath=true;a.prog.t=0;}
    let s=a.spd*mul;if(last)s=Math.min(s,Math.sqrt(2*3.2*d)+0.04);
    let ux=dx/d,uz=dz/d;
    if(!last&&!beforeJump&&d<0.6){const n=a.wp[1],ex=n[0]-w[0],ez=n[1]-w[1],el=Math.hypot(ex,ez)||1,k=(0.6-d)/0.6*0.45;
      ux=ux*(1-k)+ex/el*k;uz=uz*(1-k)+ez/el*k;const ul=Math.hypot(ux,uz)||1;ux/=ul;uz/=ul;}
    dvx=ux*s;dvz=uz*s;break;
  }
  const acc=(a.accel||5.5)*dt,ax=dvx-a.vel[0],az=dvz-a.vel[1],al=Math.hypot(ax,az);
  if(al>acc){a.vel[0]+=ax/al*acc;a.vel[1]+=az/al*acc;}else{a.vel[0]=dvx;a.vel[1]=dvz;}
  if(Math.abs(a.vel[0])+Math.abs(a.vel[1])<1e-4)return 0;
  const ci=tileIdx(a.x,a.z);
  const stepOK=pi=>stepPassable(ci,pi);
  const can=(px,pz)=>{const pi=tileIdx(px,pz);if(pi<0)return false;if(pi===ci)return true;return stepOK(pi)&&(!allow||allow(pi))&&(!G.blocked[pi]||G.blocked[ci]);};
  const nx=a.x+a.vel[0]*dt,nz=a.z+a.vel[1]*dt;
  if(can(nx,nz)){a.x=nx;a.z=nz;a.stuckT=0;return 1;}
  const ni=tileIdx(nx,nz),refused=allow&&ni>=0&&stepOK(ni)&&!allow(ni);
  if(refused){a.vel[0]*=0.3;a.vel[1]*=0.3;return -1;}
  // blocked edge (usually a clipped corner): slide along whichever axis is still free
  if(can(nx,a.z)){a.x=nx;a.vel[1]*=0.5;return 1;}
  if(can(a.x,nz)){a.z=nz;a.vel[0]*=0.5;return 1;}
  a.vel[0]*=0.3;a.vel[1]*=0.3;a.stuckT=(a.stuckT||0)+dt;if(a.stuckT>0.5){a.stuckT=0;a.repath=true;}
  return 0;
}
function newBody(a){
  const b={yaw:a.h,yawV:0,hip:a.h,hipV:0,lean:0.1,leanV:0,roll:0,rollV:0,crouch:0,crouchV:0,acc:0,pv:[0,0],swing:-1,last:0,t:Math.random()*10,sp:0,feet:[]};
  const c=Math.cos(a.h),s=Math.sin(a.h);
  for(const sd of [-1,1])b.feet.push({p:[a.x-s*0.13*sd,a.z+c*0.13*sd],from:null,to:null,t:0,T:0.3,h:0,yaw:a.h});
  return b;
}
function animBody(a,dt){
  const b=a.body||(a.body=newBody(a));
  b.t+=dt;
  const v=a.vel,sp=Math.hypot(v[0],v[1]);b.sp=sp;
  [b.yaw,b.yawV]=springA(b.yaw,b.yawV,a.h,14,dt);
  // hips turn toward travel, the chest stays on the gun; walking backward keeps the hips on the gun
  let hipT=b.yaw+(a.bladeT||0);if(sp>0.25&&!a.bladeT){const d=angDiff(b.yaw,Math.atan2(v[1],v[0]));if(Math.abs(d)<2.0)hipT=b.yaw+clamp(d,-0.6,0.6);}
  [b.hip,b.hipV]=springA(b.hip,b.hipV,hipT,7,dt);
  const tw=angDiff(b.yaw,b.hip);if(Math.abs(tw)>0.8)b.hip=b.yaw-Math.sign(tw)*0.8;
  // lean with acceleration: weight forward when driving, back when braking
  if(dt>0){const ax=(v[0]-b.pv[0])/dt,az=(v[1]-b.pv[1])/dt,fa=ax*Math.cos(b.yaw)+az*Math.sin(b.yaw);b.acc+=(clamp(fa,-6,6)-b.acc)*Math.min(1,dt*6);}
  b.pv=[v[0],v[1]];
  const aimK=clamp(((a.pose||0)-0.5)/0.5,0,1)*(1-(a.hi||0));
  const crT=a.peekLow?0.9:a.low?1.35:(a.relaxed?0.02:aimK*0.3+(sp>0.3?0.12:0.05)+(a.bladeT?0.2:0)); // a slicer sinks a little lower
  [b.crouch,b.crouchV]=spring(b.crouch,b.crouchV,crT,6,dt);
  const leanT=(a.relaxed?0.03:0.1)+aimK*0.08+b.crouch*0.14+clamp(b.acc*0.03,-0.1,0.12)+Math.min(sp,2.5)*0.025;
  [b.lean,b.leanV]=spring(b.lean,b.leanV,leanT,7,dt);
  [b.roll,b.rollV]=spring(b.roll||0,b.rollV||0,a.rollT||0,(a.peekLean||0)>0||Math.abs(a.rollT||0)<Math.abs(b.roll||0)?13:8,dt); // a peek snaps out and back
  // feet: plant, step when the body has moved away from them, alternate
  const c=Math.cos(b.hip),s=Math.sin(b.hip);
  const rest=[[0.12*aimK+0.02,-0.13-0.04*b.crouch],[-0.1*aimK-0.01,0.14+0.04*b.crouch]]; // bladed: support foot forward
  const lead=sp>0.15?0.2:0;
  const des=rest.map(([f,sd])=>[a.x+c*f-s*sd+v[0]*lead,a.z+s*f+c*sd+v[1]*lead]);
  if(b.swing<0){
    const err=b.feet.map((f,i)=>Math.hypot(f.p[0]-des[i][0],f.p[1]-des[i][1]));
    const thr=sp>0.2?0.09:0.15;
    let i=err[0]>err[1]?0:1;if(i===b.last&&err[1-i]>thr*0.6)i=1-i;
    if(err[i]>thr){const f=b.feet[i];b.swing=i;b.last=i;f.from=f.p.slice();f.t=0;f.T=clamp(0.36-sp*0.05,0.2,0.36);
      f.to=[des[i][0]+v[0]*f.T*0.5,des[i][1]+v[1]*f.T*0.5];f.yaw0=f.yaw;f.yaw1=b.hip;}
  }
  if(b.swing>=0){const f=b.feet[b.swing];f.t+=dt;const u=Math.min(1,f.t/f.T),e=u*u*(3-2*u);
    const tgt=[des[b.swing][0]+v[0]*(f.T-f.t)*0.5,des[b.swing][1]+v[1]*(f.T-f.t)*0.5];
    f.to[0]+=(tgt[0]-f.to[0])*Math.min(1,dt*10);f.to[1]+=(tgt[1]-f.to[1])*Math.min(1,dt*10);
    f.p=[f.from[0]+(f.to[0]-f.from[0])*e,f.from[1]+(f.to[1]-f.from[1])*e];
    f.h=Math.sin(Math.PI*u)*(0.05+0.06*Math.min(1,sp/2));f.yaw=f.yaw0+angDiff(f.yaw0,f.yaw1)*e;
    if(u>=1){f.h=0;b.swing=-1;}}
}

/* ---------- effects: stun grenade, shards ---------- */
function stepNades(dt){
  for(const n of nades){if(n.done)continue;n.t+=dt;
    if(n.t<n.T){const u=n.t/n.T;n.p=[n.a[0]+(n.b[0]-n.a[0])*u,n.a[1]+(n.b[1]-n.a[1])*u+Math.sin(Math.PI*u)*0.7,n.a[2]+(n.b[2]-n.a[2])*u];}
    else n.p=n.b.slice();
    if(n.t>=n.fuse){n.done=true;bangs.push({p:n.b.slice(),t:0});flashes.push({p:toW(n.b[0],0.4,n.b[2]),life:0.07,col:'#ffffff'});
      for(const e of enemies)if(e.alive&&e.room===n.room)e.stunT=rnd(2.6,3.6);
      noise(n.b[0],n.b[2],30);
      if(team.state==='stun')at(0.05,()=>{if(team.state==='stun')startEntry();});}}
  nades=nades.filter(n=>!n.done);
  for(const b of bangs)b.t+=dt;bangs=bangs.filter(b=>b.t<0.6);
}
function stepShards(dt){
  for(const s of shards){s.life-=dt;s.v[1]-=9.8*dt;
    s.g[0]+=s.v[0]*dt;s.g[1]+=s.v[1]*dt;s.g[2]+=s.v[2]*dt;
    const ang=s.w*dt;if(ang)s.off=s.off.map(p=>rot(p,s.ax,ang));
    let lo=1e9;for(const p of s.off)lo=Math.min(lo,s.g[1]+p[1]);
    if(lo<s.floor+0.01){s.g[1]+=s.floor+0.01-lo;s.v[0]*=0.55;s.v[2]*=0.55;s.v[1]=Math.abs(s.v[1])*0.22;s.w*=0.5;}}
  shards=shards.filter(s=>s.life>0);
}

function step(dt){
  if(team.state!=='secure')simT+=dt;
  stepTeam(dt);
  hearing(dt);
  team.ops.forEach(o=>stepOp(o,dt));
  separateOps(dt);
  if(WORKING.includes(team.state)){team.seenT=(team.seenT||0)-dt;if(team.seenT<=0){team.seenT=0.08;updateSeen();}}
  for(const o of team.ops)leafPush(o);
  for(const e of enemies)if(e.alive)leafPush(e);
  stepEnemies(dt);
  stepNades(dt);stepShards(dt);
  doorStep(dt);
  for(const q of pulses)q.t+=dt;pulses=pulses.filter(q=>q.t<0.4);
  for(const t of tracers)t.life-=dt;tracers=tracers.filter(t=>t.life>0);
  for(const f of flashes)f.life-=dt;flashes=flashes.filter(f=>f.life>0);
}

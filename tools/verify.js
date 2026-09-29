// Headless verification over every measurable requirement (runs the page without a browser).
// usage: node tools/verify.js dist/index.html <maps> <simSeconds> [teamSize]   (SEED=<n> for a deterministic run)
const fs=require('fs');
let src=fs.readFileSync(process.argv[2],'utf8');
src=src.slice(src.indexOf('<script>')+8,src.lastIndexOf('</script>'));
const noop=()=>{};
const ctxP=new Proxy({},{get:(t,k)=>k==='measureText'?()=>({width:10}):(k==='createRadialGradient'?()=>({addColorStop:noop}):noop),set:()=>true});
const el=()=>({getContext:()=>ctxP,classList:{add:noop,remove:noop,toggle:noop},setAttribute:noop,querySelector:()=>({textContent:''}),getBoundingClientRect:()=>({width:200,height:150}),replaceChildren:noop,append:noop,style:{},clientWidth:200,clientHeight:150});
global.document={getElementById:el,createElement:el,body:{classList:{add:noop,remove:noop,toggle:noop}},documentElement:{},fonts:null};
const team_=+(process.argv[5]||4);
global.localStorage={getItem:()=>JSON.stringify({team:team_}),setItem:noop};global.matchMedia=()=>({matches:false});
global.addEventListener=noop;global.innerWidth=800;global.innerHeight=600;global.window={devicePixelRatio:1};global.navigator={};global.requestAnimationFrame=noop;
{let a=+(process.env.SEED||1)>>>0;Math.random=()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const angDiff_=(a,b)=>{let d=(b-a)%(2*Math.PI);if(d>Math.PI)d-=2*Math.PI;if(d<-Math.PI)d+=2*Math.PI;return d;};
let X=null;globalThis.__KH_EXPORT=x=>{X=x;};
const C={};const inc=(k,n=1)=>{C[k]=(C[k]||0)+n;};const arr={};const push=(k,v)=>{(arr[k]=arr[k]||[]).push(v);};
globalThis.__KH={ev(name,d){
  const T=X&&X.team;
  switch(name){
    case 'watchdog':inc('wd.'+d.state);break;
    case 'pre':d.g.__opened=d.opened;break;
    case 'entry':{inc('entry.tech.'+d.tech);inc('entry.why.'+d.why);const g=d.g;
      if(g.__opened&&(g.type==='side'||g.type==='line'||g.type==='split'))inc(g.pie||g.peeked?'openDoor.pieOrPeek':'openDoor.direct');
      inc('stack.'+g.type);if(g.hot)inc('entry.hot');break;}
    case 'clear':{push('clear.seen',d.seen);push('clear.holdT',d.holdT);if(d.seen<0.92)inc('clear.unseen<92');break;}
    case 'tap':{const dd=Math.hypot(d.from.x-d.to.x,d.from.z-d.to.z);push('tap.dist',dd);
      const a=Math.abs(((Math.atan2(d.to.z-d.from.z,d.to.x-d.from.x)-d.from.h)%(2*Math.PI)+3*Math.PI)%(2*Math.PI)-Math.PI);push('tap.muzzleOff',a);break;}
    case 'eshot':{inc('eshot');if(!X.muzzleClear(d.e,d.op.x,d.op.z))inc('eshot.muzzleBlocked');if(!X.los(d.e.x,d.e.z,d.op.x,d.op.z))inc('eshot.noLOS');break;}
    case 'shot':{const f=d.from;if(!f.id)break;inc('oshot');
      for(const o of T.ops){if(o===f||X.floorOf(o.x)!==X.floorOf(f.x))continue;const dx=d.tx-f.x,dz=d.tz-f.z,L=dx*dx+dz*dz||1e-9,t=((o.x-f.x)*dx+(o.z-f.z)*dz)/L;
        if(t<0.05||t>1)continue;if(Math.hypot(f.x+dx*t-o.x,f.z+dz*t-o.z)<0.45&&!(o.low&&!f.low))inc('oshot.pastTeammate');}break;}
    case 'plan':if(d.contact){inc(d.room===d.contact?'contact.pickedRoom':'contact.other');}break;
    case 'heard':inc('heard');break;
    case 'peek':inc('peek');if(d.spotted)inc('peek.contact');break;
  }}};
eval(src);
const maps=+process.argv[3]||6,simS=+process.argv[4]||1200;
const cat=o=>o.tuck>0.5?'SUL':o.hi>0.5?'HIGH':o.pose>=0.95?'AIM':o.pose>=0.4?'READY':'LOW';
let secure=0,premature=0,timeout=0,err=0,samples=0,opS=0,moveS=0,fps=0;const tStart=Date.now();
const segD=(px,pz,ax,az,bx,bz)=>{const dx=bx-ax,dz=bz-az,L=dx*dx+dz*dz||1e-9;let t=((px-ax)*dx+(pz-az)*dz)/L;t=Math.max(0,Math.min(1,t));return Math.hypot(ax+dx*t-px,az+dz*t-pz);};
for(let m=0;m<maps;m++){
  try{X.reset();}catch(e){inc('resetErr');continue;}
  const G=X.G(),T=X.team;if(G.F===3)push('footprint3F',G.BW*G.BH);else push('footprint'+G.F+'F',G.BW*G.BH);
  inc('doors.leaf',G.doors.filter(d=>!d.arch&&!d.stair&&!d.pocket).length);inc('doors.pocket',G.doors.filter(d=>d.pocket).length);
  let t=0,k=0,done=false;const last=new Map(),doorO=new Map(),prevTile=new Map();let compAt=null,compPos=null;
  try{
    while(t<simS){X.step(0.02);t+=0.02;k++;
      const E=X.enemies();
      // door opens: who is at it
      for(const d of G.doors){if(d.arch||d.stair)continue;const p=doorO.get(d)||0;
        if(p<0.5&&d.o>=0.5){const near=[...T.ops,...E.filter(e=>e.alive)].some(a=>X.floorOf(a.x)===X.floorOf(d.P[0])&&Math.hypot(a.x-d.P[0],a.z-d.P[1])<2.0);inc(near?'door.openAttended':'door.openUnattended');}
        doorO.set(d,d.o);}
      // crossings through a door that is not open
      for(const a of [...T.ops,...E.filter(e=>e.alive)]){const ti=X.tileIdx(a.x,a.z),pt=prevTile.get(a);
        if(pt!=null&&pt!==ti){const dr=G.doorByKey.get(pt<ti?pt*131072+ti:ti*131072+pt);if(dr&&!dr.arch&&!dr.stair&&dr.o<0.5){inc(a.id?'cross.closed.op':'cross.closed.enemy');if(process.env.BREAK)console.log('XDOOR',a.id?'op'+a.id:'enemy',T.state,'target?',dr===T.door,'o',dr.o.toFixed(2),'breached',!!dr.breached,'openReq',dr.openReq,'tOpen',!!dr.tOpen,'why',a.why,'wp',a.wp&&a.wp.length);}}prevTile.set(a,ti);}
      if(!compAt&&T.state!=='plan'&&E.some(e=>e.state&&e.state!=='idle')){compAt=t;compPos=new Map(E.map(e=>[e,[e.x,e.z]]));}
      if(k%5)continue;samples++;
      for(const o of T.ops){opS++;
        // stances and transitions
        const c=cat(o),L=last.get(o);inc('stance.'+c);if(L&&L!==c&&((L==='HIGH'&&c==='SUL')||(L==='SUL'&&c==='HIGH')))inc('stance.directHighSul');last.set(o,c);
        if(o.relaxed&&T.state!=='secure')inc('relaxedBeforeSecure');
        // overlap
        for(const q of T.ops)if(q.id>o.id&&X.floorOf(q.x)===X.floorOf(o.x)&&Math.hypot(q.x-o.x,q.z-o.z)<0.3)inc('overlap.opOp');
        for(const e of E)if(e.alive&&X.floorOf(e.x)===X.floorOf(o.x)&&Math.hypot(e.x-o.x,e.z-o.z)<0.35)inc('overlap.opEnemy');
        // muzzle on a teammate (pitch-aware reach; a level muzzle passes over a kneeling man)
        if(o.tuck<0.5&&o.hi<0.5){const pit=X.poseAt(o.pose,o.hi).pitch,reach=pit>0.05?Math.min(9,1.4/Math.tan(pit)+0.3):9,c2=Math.cos(o.h),s2=Math.sin(o.h);
          for(const q of T.ops){if(q===o||X.floorOf(q.x)!==X.floorOf(o.x))continue;if(q.low&&!o.low&&pit<0.15)continue;const dx=q.x-o.x,dz=q.z-o.z,al=dx*c2+dz*s2;
            if(al<0.15||al>reach||Math.abs(-dx*s2+dz*c2)>0.35||!X.los(o.x,o.z,q.x,q.z))continue;inc('muzzleOnTeammate');if(process.env.BREAK)inc('mot|'+T.state+'|'+o.why+'|'+c+'|d'+(al<0.9?'<.9':al<1.6?'<1.6':'>1.6')+(o.flagT>0?'|flag':'')+(o.tap?'|tap':''));break;}}
        // barrel physically inside a teammate
        {const {ch,c:cc,s:ss}=X.chestW(o);let hit=false;for(const kk of [0.3,0.5,0.72]){const q=X.rifleAt(o.pose,kk,0,o.hi,o.tuck||0),p=[ch[0]+cc*q[0]-ss*q[1],ch[1]+q[2]-1.44,ch[2]+ss*q[0]+cc*q[1]];
          for(const m2 of T.ops){if(m2===o||X.floorOf(m2.x)!==X.floorOf(o.x))continue;const w=X.wpos(m2.x,m2.z);if(Math.hypot(p[0]-w[0],p[2]-w[2])<(p[1]-w[1]>1.0?0.24:0.17)&&p[1]>w[1]+0.25&&p[1]<w[1]+1.85){hit=true;break;}}if(hit)break;}if(hit)inc('barrelInTeammate');}
        // body inside an open leaf
        for(const d of G.doors){if(d.arch||d.stair||d.pocket||d.o<0.3)continue;if(Math.abs(d.P[0]-o.x)>1.5||Math.abs(d.P[1]-o.z)>1.5)continue;const s_=X.leafSeg(d);if(segD(o.x,o.z,s_[0],s_[1],s_[2],s_[3])<0.16){inc('bodyInLeaf');break;}}
        // on a stair flight without climbing
        {const i=X.tileIdx(o.x,o.z);if(i>=0&&G.rampOf[i]>=0&&X.stairH(o.x,o.z)>0.15&&!(T.geo&&T.geo.stair)&&!o.wp.some(w=>w.jump))inc('onStairsNotClimbing');}
        // facing backward while travelling
        if(T.state==='move'&&Math.hypot(o.vel[0],o.vel[1])>0.5&&!o.aim){moveS++;const a=Math.abs(((Math.atan2(o.vel[1],o.vel[0])-o.h)%(2*Math.PI)+3*Math.PI)%(2*Math.PI)-Math.PI);
          if(a>2.1)inc(o.why==='rear'?'move.backward.rear':'move.backward.other');}
        const b=o.body;if(b&&Math.abs(b.roll||0)>0.25)inc('lean>0.25');
        if(o.pie){inc('pie.samples');if((o.shoulder??1)<0)inc('pie.leftShoulder');if(b&&Math.abs(angDiff_(b.hip,b.yaw))>0.3)inc('pie.bladed');}
        if(o.alert&&X.simT()<o.alert.t)inc('alert.samples');
        if(o.say==='MOVEMENT'&&o.sayT<0.03)inc('call.movement');
        // hold: how far off his sector a man ever turns (glance and return: no full turns)
        if(T.state==='hold'&&o.face!=null&&!o.aim&&X.ridAt(o.x,o.z)===(T.room&&T.room.id)){const off=Math.abs(angDiff_(o.face,o.h));if(off>2.7&&o.why!=='cover'){inc('hold.turnedAround');if(process.env.BREAK)inc('turn|'+o.why);}inc('hold.samples');}
        if(o.tap&&o.tap.t>0.25){const q=o.tap.to,a=Math.abs(((Math.atan2(q.z-o.z,q.x-o.x)-o.h)%(2*Math.PI)+3*Math.PI)%(2*Math.PI)-Math.PI);push('tap.muzzleOffMid',a);}
      }
      // danger areas near the team left uncovered while moving
      if(T.state==='move'){fps++;const lead=T.ops[0];if((T.frontier||[]).some(d=>d!==T.door&&!d.stair&&X.floorOf(d.P[0])===X.floorOf(lead.x)&&Math.hypot(d.P[0]-lead.x,d.P[1]-lead.z)<4&&!d.covered&&T.ops.some(o=>X.los(o.x,o.z,d.hold[0],d.hold[1]))))inc('dangerUncovered');}
      for(let i=0;i<E.length;i++)for(let j=i+1;j<E.length;j++){const a=E[i],b2=E[j];if(a.alive&&b2.alive&&X.floorOf(a.x)===X.floorOf(b2.x)&&Math.hypot(a.x-b2.x,a.z-b2.z)<0.35)inc('overlap.enemyEnemy');}
      if(T.state==='secure'){const un=G.rooms.filter(r=>r.id>1&&!r.cleared);if(un.length)premature++;else secure++;done=true;break;}
    }
  }catch(e){err++;console.log('ERR',e.stack.split('\n').slice(0,3).join(' | '));done=true;}
  if(!done)timeout++;
  if(compPos){let moved=0,n=0;for(const [e,p] of compPos){n++;if(!e.alive||Math.hypot(e.x-p[0],e.z-p[1])>1)moved++;}inc('enemies.atCompromise',n);inc('enemies.movedOrDownAfter',moved);}
}
const pct=(a,b)=>b?(100*a/b).toFixed(2)+'%':'-';const avg=a=>a&&a.length?(a.reduce((x,y)=>x+y,0)/a.length):NaN;
const out={team:team_,maps,secure,premature,timeout,err,watchdogs:Object.fromEntries(Object.entries(C).filter(([k])=>k.startsWith('wd.')).map(([k,v])=>[k.slice(3),v])),
  R3_dangerUncoveredWhileMoving:pct(C.dangerUncovered||0,fps),
  R4_enemiesMovedAfterCompromise:pct(C['enemies.movedOrDownAfter']||0,C['enemies.atCompromise']||0),
  R6_enemyOverlap:C['overlap.enemyEnemy']||0,R7_opEnemyOverlap:pct(C['overlap.opEnemy']||0,opS),R10_opOpOverlap:pct(C['overlap.opOp']||0,opS),
  R10_muzzleOnTeammate:pct(C.muzzleOnTeammate||0,opS),R15_barrelInTeammate:pct(C.barrelInTeammate||0,opS),
  R14_shotsPastTeammate:`${C['oshot.pastTeammate']||0}/${C.oshot||0}`,R14_backwardWhileMoving:pct((C['move.backward.other']||0),moveS),R14_rearSecurityBackward:pct(C['move.backward.rear']||0,moveS),
  R16_18_bodyInLeaf:pct(C.bodyInLeaf||0,opS),R18_closedDoorCrossings:{ops:C['cross.closed.op']||0,enemies:C['cross.closed.enemy']||0},
  R17_relaxedBeforeSecure:C.relaxedBeforeSecure||0,
  R21_entryTech:{CROSS:C['entry.tech.CROSS']||0,BUTTONHOOK:C['entry.tech.BUTTONHOOK']||0,CRISSCROSS:C['entry.tech.CRISSCROSS']||0},R33_entryDirectionBasis:{door:C['entry.why.door']||0,unseen:C['entry.why.unseen']||0,threat:C['entry.why.threat']||0},
  R11_21_clearsWithUnder92pctSeen:`${C['clear.unseen<92']||0}/${(arr['clear.seen']||[]).length}`,R11_meanSeenAtClear:avg(arr['clear.seen']).toFixed(3),
  R24_meanHoldBeforeClear_s:avg(arr['clear.holdT']).toFixed(2),
  R22_openDoorPieOrPeek:pct(C['openDoor.pieOrPeek']||0,(C['openDoor.pieOrPeek']||0)+(C['openDoor.direct']||0)),
  R25_fileStackShare:pct(C['stack.line']||0,(C['stack.line']||0)+(C['stack.side']||0)+(C['stack.split']||0)),
  R26_onStairsNotClimbing:pct(C.onStairsNotClimbing||0,opS),
  R27_tap:{n:(arr['tap.dist']||[]).length,meanDist:avg(arr['tap.dist']).toFixed(2),maxDist:Math.max(0,...(arr['tap.dist']||[0])).toFixed(2),muzzleOffMid_p05:(()=>{const a=(arr['tap.muzzleOffMid']||[]).slice().sort((x,y)=>x-y);return a.length?a[Math.floor(a.length*0.05)].toFixed(2):'-';})(),muzzleOnMateMid:pct((arr['tap.muzzleOffMid']||[]).filter(v=>v<0.4).length,(arr['tap.muzzleOffMid']||[]).length)},
  R28_directHighSul:C['stance.directHighSul']||0,
  R32_stanceShare:Object.fromEntries(['SUL','LOW','READY','AIM','HIGH'].map(k=>[k,pct(C['stance.'+k]||0,opS)])),
  R30_contactPlans:{pickedContactRoom:C['contact.pickedRoom']||0,other:C['contact.other']||0},
  NEW_hotEntries:C['entry.hot']||0,NEW_pieLeftShoulder:pct(C['pie.leftShoulder']||0,C['pie.samples']||0),NEW_pieBladed:pct(C['pie.bladed']||0,C['pie.samples']||0),
  NEW_orientingOnThreat:pct(C['alert.samples']||0,opS),NEW_movementCalls:C['call.movement']||0,NEW_heardEvents:C.heard||0,NEW_holdTurnedAround:pct(C['hold.turnedAround']||0,C['hold.samples']||0),
  R31_peeks:`${C.peek||0} (contact ${C['peek.contact']||0}), lean samples ${C['lean>0.25']||0}`,
  R34_enemyShots:{total:C.eshot||0,muzzleBlocked:C['eshot.muzzleBlocked']||0,noLOS:C['eshot.noLOS']||0},
  R35_doorOpens:{attended:C['door.openAttended']||0,unattended:C['door.openUnattended']||0},
  R13_footprint:{'3F':avg(arr.footprint3F),'2F':avg(arr.footprint2F),'1F':avg(arr.footprint1F)},doors:{leaf:C['doors.leaf']||0,pocket:C['doors.pocket']||0},
  runtime_s:((Date.now()-tStart)/1000).toFixed(0)};
console.log(JSON.stringify(out,null,1));if(process.env.BREAK)console.log(JSON.stringify(Object.entries(C).filter(([k])=>k.startsWith('mot|')||k.startsWith('turn|')).sort((a,b)=>b[1]-a[1]).slice(0,15)));

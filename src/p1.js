(()=>{
'use strict';
const $=id=>document.getElementById(id);
const cv=$('cv'), ctx=cv.getContext('2d');
const mm=$('mm'), mctx=mm.getContext('2d');

/* ---------- utils ---------- */
const rnd=(a,b)=>a+Math.random()*(b-a);
const ri=(a,b)=>Math.floor(a+Math.random()*(b-a+1));
const pick=a=>a[Math.floor(Math.random()*a.length)];
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const TAU=Math.PI*2;
const angDiff=(a,b)=>{let d=(b-a)%TAU;if(d>Math.PI)d-=TAU;if(d<-Math.PI)d+=TAU;return d;};
const pad=(n,l=2)=>String(n).padStart(l,'0');
const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;

const COL={ground:'#070b10',team:'#ffb547',hostile:'#ff5a47',clear:'#4fd38a'};
const M=4, WALL_H=2.6, DOOR_H=2.05, FH=3.2; // FH: floor-to-floor height

/* ---------- settings ---------- */
const S={hostiles:true,cam:'auto',speed:1,team:4};
try{const s=JSON.parse(localStorage.getItem('roomclear.v1')||'{}');
  if(typeof s.hostiles==='boolean')S.hostiles=s.hostiles;
  if(['auto','orbit','follow','chase','helmet','plan'].includes(s.cam))S.cam=s.cam;
  if([1,2,4].includes(s.speed))S.speed=s.speed;
  if([1,2,3,4].includes(s.team))S.team=s.team;}catch(e){}
const save=()=>{try{localStorage.setItem('roomclear.v1',JSON.stringify(S));}catch(e){}};

/* ---------- map ----------
   Every floor is laid out in its own page of one wide 2D grid (page f starts at x = f*PW).
   Pages are drawn stacked FH apart; stairwells link pages through portal tiles. */
let G=null;
/* shared constants */
const LEAF_SOLID=0.45; // a door leaf open past this blocks its edge and sight; a door open past it lets sight through
const RIFLE_LEN=0.72;  // chest pivot to muzzle, m
const SAY_T=1.7;       // how long a voice call stays on screen, s
const inB=(x,y)=>x>=0&&y>=0&&x<G.TW&&y<G.GH;
const ix=i=>i%G.TW, iy=i=>(i/G.TW)|0;
const dkey=(i1,i2)=>i1<i2?i1*131072+i2:i2*131072+i1;
const isDoor=(i1,i2)=>G.doorSet.has(dkey(i1,i2));
function open(x,y,dx,dy,sight=false){const nx=x+dx,ny=y+dy;if(!inB(nx,ny))return false;
  const i1=y*G.TW+x,i2=ny*G.TW+nx;
  if(G.leafBy.size&&!G.noLeaf){const lf=G.leafBy.get(dkey(i1,i2));if(lf&&lf.o>LEAF_SOLID)return false;} // an open door leaf lies on this edge
  if(!sight&&G.rail.has(dkey(i1,i2)))return false; // stair rail / the drop at the head of a flight: see across, don't walk across
  if(G.rid[i1]===G.rid[i2])return true;return isDoor(i1,i2);}
function trans(x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1;if(!dx&&!dy)return true;
  if(Math.abs(dx)>1||Math.abs(dy)>1)return false;
  if(!dx||!dy)return open(x1,y1,dx,dy);
  return (open(x1,y1,dx,0)&&open(x1+dx,y1,0,dy))||(open(x1,y1,0,dy)&&open(x1,y1+dy,dx,0));}
const transI=(a,b)=>trans(ix(a),iy(a),ix(b),iy(b));
function diagOK(x,y,dx,dy){return open(x,y,dx,0)&&open(x+dx,y,0,dy)&&open(x,y,0,dy)&&open(x,y+dy,dx,0);}
const tileIdx=(x,z)=>{const gx=Math.floor(x),gz=Math.floor(z);if(gx<0||gz<0||gx>=G.TW||gz>=G.GH)return -1;return gz*G.TW+gx;};
const ridAt=(x,z)=>{const i=tileIdx(x,z);return i<0?-1:G.rid[i];};
const floorOf=x=>Math.floor(x/G.PW);
function stairH(x,z){const i=tileIdx(x,z);if(i<0)return 0;const k=G.rampOf[i];if(k<0)return 0;const RP=G.ramps[k];
  const al=RP.axis==='v'?(RP.r===0?z-RP.y0:RP.y0+4-z):(RP.r===0?x-RP.x0:RP.x0+4-x);return clamp((al-0.5)/3,0,1)*FH;}
const floorY=(x,z)=>floorOf(x)*FH+stairH(x,z);
function wpos(x,z){const f=floorOf(x);return [x-f*G.PW,f*FH+stairH(x,z),z];}
function wdist(x1,z1,x2,z2){const a=wpos(x1,z1),b=wpos(x2,z2);return Math.hypot(a[0]-b[0],(a[1]-b[1])*1.5,a[2]-b[2]);}
const tc=i=>[ix(i)+0.5,iy(i)+0.5];

function genMap(){
  const F=Math.random()<0.28?1:Math.random()<0.55?2:3;
  const BW=F===3?ri(15,18):F===2?ri(19,24):ri(18,28),BH=F===3?ri(11,14):F===2?ri(14,18):ri(13,19);
  const GW=BW+2*M,GH=BH+2*M,PW=GW+2,TW=F*PW,N=TW*GH;
  const g={BW,BH,GW,GH,F,PW,TW,N,rid:new Int16Array(N),blocked:new Uint8Array(N),reserved:new Uint8Array(N),
    rooms:[],doors:[],doorSet:new Set(),doorByKey:new Map(),leafBy:new Map(),pairs:new Set(),furn:[],segs:[],
    portal:new Int32Array(N).fill(-1),rampOf:new Int16Array(N).fill(-1),ramps:[],stairs:[],rail:new Set()};
  G=g;
  const I=(x,y)=>y*TW+x;
  const mk=(o)=>Object.assign({cleared:false,doorSides:new Set(),doorPts:[]},o);
  g.rooms.push(mk({id:0,x:0,y:0,w:GW,h:GH,f:0,cleared:true,outside:true}));
  g.rooms.push(mk({id:1,x:0,y:0,w:0,h:0,f:0,cleared:true,air:true}));
  for(let y=0;y<GH;y++)for(let x=0;x<TW;x++){const f=Math.floor(x/PW),lx=x-f*PW;if(f>0||lx>=GW){g.rid[I(x,y)]=1;g.blocked[I(x,y)]=1;}}
  const bld=id=>id>1;
  const leaf=r=>{r=mk(r);r.id=g.rooms.length;g.rooms.push(r);
    for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++){g.rid[I(x,y)]=r.id;g.blocked[I(x,y)]=0;}return r;};
  const addDoor=(ax,ay,bx,by)=>{const i1=I(ax,ay),i2=I(bx,by),k=dkey(i1,i2);if(g.doorSet.has(k))return null;
    const ra=g.rid[i1],rb=g.rid[i2];if(ra===rb)return null;g.doorSet.add(k);
    g.pairs.add(Math.min(ra,rb)+':'+Math.max(ra,rb));const d={ax,ay,bx,by,i1,i2,o:0};g.doors.push(d);g.doorByKey.set(k,d);return d;};
  // an open archway where two hallways meet (T or L junction): no leaf, several edges wide
  const addArch=edges=>{const e0=edges[0],i1=I(e0[0],e0[1]),i2=I(e0[2],e0[3]);
    const d={ax:e0[0],ay:e0[1],bx:e0[2],by:e0[3],i1,i2,o:1,arch:true,edges};
    for(const e of edges){const k=dkey(I(e[0],e[1]),I(e[2],e[3]));g.doorSet.add(k);g.doorByKey.set(k,d);}
    g.pairs.add(Math.min(g.rid[i1],g.rid[i2])+':'+Math.max(g.rid[i1],g.rid[i2]));g.doors.push(d);return d;};
  function connectAcross(vert,L,from,to,many){
    const groups=new Map();
    for(let k=from;k<to;k++){
      const ax=vert?L-1:k,ay=vert?k:L-1,bx=vert?L:k,by=vert?k:L;
      const a=g.rid[I(ax,ay)],b=g.rid[I(bx,by)];
      if(!bld(a)||!bld(b)||g.rooms[a].stair||g.rooms[b].stair)continue;
      const key=a+':'+b;if(!groups.has(key))groups.set(key,[]);groups.get(key).push([ax,ay,bx,by]);
    }
    const arr=[...groups.values()];if(!arr.length)return;
    const place=grp=>{const r1=g.rooms[g.rid[I(grp[0][0],grp[0][1])]],r2=g.rooms[g.rid[I(grp[0][2],grp[0][3])]];
      if(r1.hall&&r2.hall&&grp.length<=3){addArch(grp);return;}
      const e=grp.length>=3?grp[ri(1,grp.length-2)]:grp[Math.floor(grp.length/2)];addDoor(...e);};
    if(many){let n=0;arr.forEach(grp=>{const h=g.rooms[g.rid[I(grp[0][0],grp[0][1])]].hall&&g.rooms[g.rid[I(grp[0][2],grp[0][3])]].hall;
        if((grp.length>=3||h)&&Math.random()<0.85){place(grp);n++;}});
      if(!n)place(arr.slice().sort((a,b)=>b.length-a.length)[0]);}
    else{const good=arr.filter(x=>x.length>=3);place(pick(good.length?good:arr));}
  }
  function split(r,depth){
    const MIN=3,canV=r.w>=MIN*2,canH=r.h>=MIN*2,area=r.w*r.h;
    if((!canV&&!canH)||(area<=48&&Math.random()<0.45)||(area<=30&&Math.random()<0.7)||(area<=80&&Math.random()<0.08)){leaf(r);return;}
    const vert=canV&&canH?(r.w>r.h*1.2?true:r.h>r.w*1.2?false:Math.random()<0.5):canV;
    const len=vert?r.w:r.h, base=vert?r.x:r.y, from=vert?r.y:r.x, to=vert?r.y+r.h:r.x+r.w;
    // hallways: a long hall at the top level, and branch halls one level down that meet it in a T
    if((depth===0&&len>=13&&Math.random()<0.6)||(depth===1&&len>=10&&Math.random()<0.5)){
      const s=ri(MIN,len-MIN-2);
      const A=vert?{x:r.x,y:r.y,w:s,h:r.h}:{x:r.x,y:r.y,w:r.w,h:s};
      const C=vert?{x:r.x+s,y:r.y,w:2,h:r.h,hall:true}:{x:r.x,y:r.y+s,w:r.w,h:2,hall:true};
      const B=vert?{x:r.x+s+2,y:r.y,w:r.w-s-2,h:r.h}:{x:r.x,y:r.y+s+2,w:r.w,h:r.h-s-2};
      split(A,depth+1);leaf(C);split(B,depth+1);
      connectAcross(vert,base+s,from,to,true);connectAcross(vert,base+s+2,from,to,true);return;
    }
    const s=ri(MIN,len-MIN);
    const A=vert?{x:r.x,y:r.y,w:s,h:r.h}:{x:r.x,y:r.y,w:r.w,h:s};
    const B=vert?{x:r.x+s,y:r.y,w:r.w-s,h:r.h}:{x:r.x,y:r.y+s,w:r.w,h:r.h-s};
    split(A,depth+1);split(B,depth+1);connectAcross(vert,base+s,from,to,false);
  }
  // switchback stairwell: same footprint on every floor, reached down a short hallway.
  // 2 x 6 tiles: a flat platform at each end (door side / turn), the 4-tile flight in between, railed on its open side
  const axis=Math.random()<0.5?'v':'h',SL=6;
  const sx=axis==='v'?ri(M+3,M+BW-5):ri(M+3,Math.max(M+3,M+BW-9)),sy=axis==='v'?ri(M+3,Math.max(M+3,M+BH-9)):ri(M+3,M+BH-5);
  for(let f=0;f<F;f++){
    const ox=f*PW;
    if(F===1){split({x:ox+M,y:M,w:BW,h:BH},0);continue;}
    let SR;
    if(axis==='v'){
      split({x:ox+M,y:M,w:sx-M,h:BH},1);split({x:ox+sx+2,y:M,w:M+BW-sx-2,h:BH},1);
      leaf({x:ox+sx,y:M,w:2,h:sy-M,hall:true,f});leaf({x:ox+sx,y:sy+SL,w:2,h:M+BH-sy-SL,hall:true,f});
      SR=leaf({x:ox+sx,y:sy,w:2,h:SL,stair:true,f});
      connectAcross(true,ox+sx,M,M+BH,true);connectAcross(true,ox+sx+2,M,M+BH,true);
    }else{
      split({x:ox+M,y:M,w:BW,h:sy-M},1);split({x:ox+M,y:sy+2,w:BW,h:M+BH-sy-2},1);
      leaf({x:ox+M,y:sy,w:sx-M,h:2,hall:true,f});leaf({x:ox+sx+SL,y:sy,w:M+BW-sx-SL,h:2,hall:true,f});
      SR=leaf({x:ox+sx,y:sy,w:SL,h:2,stair:true,f});
      connectAcross(false,sy,ox+M,ox+M+BW,true);connectAcross(false,sy+2,ox+M,ox+M+BW,true);
    }
    // lanes / ends: floor f climbs in lane r from end r to end 1-r; k=0..3 is the flight, k=-1 / k=4 the platforms
    const r=f%2,T=(lane,k,end)=>axis==='v'?[ox+sx+lane,end===0?sy+1+k:sy+4-k]:[end===0?ox+sx+1+k:ox+sx+4-k,sy+lane];
    const u=axis==='v'?[0,r===0?1:-1]:[r===0?1:-1,0];
    const land=T(1-r,0,r),rs=T(r,0,r),out=T(1-r,-1,r),out2=T(r,-1,r),hall=T(1-r,-2,r);
    SR.si={axis,r,f,u,land:[land[0]+0.5,land[1]+0.5],rampStart:[rs[0]+0.5,rs[1]+0.5],out:[out[0]+0.5,out[1]+0.5],out2:[out2[0]+0.5,out2[1]+0.5],up:f<F-1};
    addDoor(hall[0],hall[1],out[0],out[1]);
    if(f>0)for(let k=1;k<4;k++){const t=T(1-r,k,r);g.blocked[I(t[0],t[1])]=1;} // stairwell opening above the flight below
    if(f<F-1){const ri_=g.ramps.length;g.ramps.push({f,axis,r,x0:ox+sx+(axis==='h'?1:0),y0:sy+(axis==='v'?1:0)});
      for(let k=0;k<4;k++){const t=T(r,k,r);g.rampOf[I(t[0],t[1])]=ri_;
        if(k>=1){const q=T(1-r,k,r);g.rail.add(dkey(I(t[0],t[1]),I(q[0],q[1])));}} // on the flight only at its foot
      const top=T(r,3,r),pl=T(r,4,r);g.rail.add(dkey(I(top[0],top[1]),I(pl[0],pl[1])));} // no stepping off the head of the flight
    g.stairs[f]=SR;
  }
  for(let f=0;f<F-1;f++){ // portals: top of the flight on f <-> same spot on f+1
    const si=g.stairs[f].si,top=[si.rampStart[0]+si.u[0]*3,si.rampStart[1]+si.u[1]*3];
    const i1=tileIdx(top[0],top[1]),i2=i1+PW;g.portal[i1]=i2;g.portal[i2]=i1;
    const P=[top[0]+si.u[0]*0.5,top[1]+si.u[1]*0.5];
    const e=si.u[0]?[P[0],P[1]-0.5,P[0],P[1]+0.5]:[P[0]-0.5,P[1],P[0]+0.5,P[1]];
    g.doors.push({stair:true,i1,i2,o:1,P,e,f,up:si.u});
  }

  // extra doors for loops (same floor, rooms only)
  const cand=new Map();
  for(let y=0;y<GH;y++)for(let x=0;x<TW-1;x++){
    const r=g.rid[I(x,y)];if(!bld(r)||g.rooms[r].stair)continue;
    for(const [dx,dy] of [[1,0],[0,1]]){if(y+dy>=GH)continue;const q=g.rid[I(x+dx,y+dy)];
      if(q===r||!bld(q)||g.rooms[q].stair)continue;const k=Math.min(r,q)+':'+Math.max(r,q);
      if(!cand.has(k))cand.set(k,[]);cand.get(k).push([x,y,x+dx,y+dy]);}
  }
  cand.forEach((list,k)=>{if(g.pairs.has(k))return;if(list.length>=3&&Math.random()<0.25)addDoor(...list[ri(1,list.length-2)]);});

  // exterior doors (ground floor)
  const nExt=Math.random()<0.55?1:2;let placed=0,guard=0;
  while(placed<nExt&&guard++<80){
    const side=ri(0,3);let bx,by,ox_,oy;
    if(side===0){bx=ri(M+2,M+BW-3);by=M;ox_=bx;oy=M-1;}
    else if(side===2){bx=ri(M+2,M+BW-3);by=M+BH-1;ox_=bx;oy=M+BH;}
    else if(side===1){bx=M+BW-1;by=ri(M+2,M+BH-3);ox_=M+BW;oy=by;}
    else{bx=M;by=ri(M+2,M+BH-3);ox_=M-1;oy=by;}
    const r=g.rooms[g.rid[I(bx,by)]];if(r.stair)continue;
    if(side%2===0){if(bx<=r.x||bx>=r.x+r.w-1)continue;}else{if(by<=r.y||by>=r.y+r.h-1)continue;}
    if(g.doors.some(d=>!d.stair&&(g.rid[d.i1]===0||g.rid[d.i2]===0)&&Math.abs(d.bx-bx)+Math.abs(d.by-by)<5))continue;
    addDoor(ox_,oy,bx,by);placed++;
  }
  if(!placed){for(let x=M+2;x<M+BW-2&&!placed;x++){if(!g.rooms[g.rid[I(x,M)]].stair){addDoor(x,M-1,x,M);placed++;}}}

  // make sure every room can be reached (ground floor through portals to the top)
  const extDoor=g.doors.find(d=>!d.stair&&(g.rid[d.i1]===0||g.rid[d.i2]===0));
  const seed=g.rid[extDoor.i1]===0?extDoor.i1:extDoor.i2;
  const reach=(useBlocked)=>{const seen=new Uint8Array(N),q=[seed];seen[seed]=1;
    while(q.length){const i=q.pop(),x=i%TW,y=(i/TW)|0;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(!inB(nx,ny))continue;const j=I(nx,ny);
        if(seen[j]||(useBlocked&&g.blocked[j])||!open(x,y,dx,dy))continue;if(g.rid[j]===1)continue;seen[j]=1;q.push(j);}
      const p=g.portal[i];if(p>=0&&!seen[p]){seen[p]=1;q.push(p);}}
    return seen;};
  for(let pass=0;pass<40;pass++){
    const seen=reach(true);
    const un=g.rooms.filter(r=>bld(r.id)&&!r.stair&&!(()=>{for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)if(seen[I(x,y)])return true;return false;})());
    if(!un.length)break;
    let added=false;
    for(const r of un){const opts=[];
      for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nx=x+dx,ny=y+dy;if(!inB(nx,ny))continue;const j=I(nx,ny),q=g.rid[j];
        if(!seen[j]||!bld(q)||g.rooms[q].stair||q===r.id)continue;opts.push([x,y,nx,ny]);}
      if(opts.length){addDoor(...opts[Math.floor(opts.length/2)]);added=true;}}
    if(!added)break;
  }

  // door geometry + sides
  g.doors.forEach(d=>{if(d.stair){d.locked=false;return;}
    const seg=e=>e[0]===e[2]?[e[0],Math.max(e[1],e[3]),e[0]+1,Math.max(e[1],e[3])]:[Math.max(e[0],e[2]),e[1],Math.max(e[0],e[2]),e[1]+1];
    if(d.arch){const a=seg(d.edges[0]),b=seg(d.edges[d.edges.length-1]);d.e=[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])];}
    else d.e=seg([d.ax,d.ay,d.bx,d.by]);
    d.P=[(d.e[0]+d.e[2])/2,(d.e[1]+d.e[3])/2];
    d.locked=!d.arch&&Math.random()<((g.rid[d.i1]===0||g.rid[d.i2]===0)?0.5:0.22);
    if(!d.arch){d.flip=Math.random()<0.5;d.swA=Math.random()<0.5;} // hinge at either jamb, opens into either side
    [[d.ax,d.ay,d.bx,d.by],[d.bx,d.by,d.ax,d.ay]].forEach(([x,y,ox_,oy])=>{
      const r=g.rooms[g.rid[I(x,y)]];if(!r||!bld(r.id))return;
      const dx=ox_-x,dy=oy-y;r.doorSides.add(dx<0?'W':dx>0?'E':dy<0?'N':'S');r.doorPts.push(d.P);
    });
  });
  // an open leaf lies along the tile edge next to the hinge jamb, on the swing side: that edge is solid while it is open
  const setLeaf=(d,flip,swA)=>{const [x1,z1,x2,z2]=d.e,w=[d.bx-d.ax,d.by-d.ay];d.flip=flip;d.swA=swA;
    d.hinge=flip?[x2,z2]:[x1,z1];d.hdir=flip?[x1-x2,z1-z2]:[x2-x1,z2-z1];d.sw=swA?[-w[0],-w[1]]:w;d.swingTile=swA?d.i1:d.i2;
    const st=d.swingTile,nx=(st%TW)-d.hdir[0],ny=((st/TW)|0)-d.hdir[1];
    d.leafKey=nx>=0&&ny>=0&&nx<TW&&ny<GH&&g.rid[I(nx,ny)]===g.rid[st]?dkey(st,I(nx,ny)):null;return d.leafKey;};
  for(const d of g.doors){if(d.arch||d.stair)continue;if(setLeaf(d,d.flip,d.swA))g.leafBy.set(d.leafKey,d);}
  // reserve door bands (entry lanes, stack lanes)
  g.rooms.forEach(r=>{if(!bld(r.id))return;
    for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++){const lx=x-r.x,ly=y-r.y;
      if((r.doorSides.has('W')&&lx<=1)||(r.doorSides.has('E')&&lx>=r.w-2)||(r.doorSides.has('N')&&ly<=1)||(r.doorSides.has('S')&&ly>=r.h-2))g.reserved[I(x,y)]=1;}});

  // furniture
  const HT1={cabinet:1.45,crate:0.9,locker:1.9},HT2={table:0.76,couch:0.85,shelf:1.9,desk:0.76};
  g.rooms.forEach(r=>{
    if(!bld(r.id)||r.hall||r.stair||r.w<4||r.h<4)return;
    const tries=Math.floor(r.w*r.h/9);
    for(let k=0;k<tries;k++){
      const sides=['N','S','E','W'].filter(s=>!r.doorSides.has(s));if(!sides.length)break;
      const side=pick(sides),long=Math.random()<0.5?2:1;let fx,fy,fw,fh;
      if(side==='N'||side==='S'){fx=ri(r.x,r.x+r.w-long);fy=side==='N'?r.y:r.y+r.h-1;fw=long;fh=1;}
      else{fy=ri(r.y,r.y+r.h-long);fx=side==='W'?r.x:r.x+r.w-1;fw=1;fh=long;}
      let ok=true;for(let y=fy;y<fy+fh;y++)for(let x=fx;x<fx+fw;x++){const i=I(x,y);if(g.reserved[i]||g.blocked[i])ok=false;}
      if(!ok)continue;
      for(let y=fy;y<fy+fh;y++)for(let x=fx;x<fx+fw;x++)g.blocked[I(x,y)]=1;
      const kind=long===2?pick(Object.keys(HT2)):pick(Object.keys(HT1));
      g.furn.push({x:fx,y:fy,w:fw,h:fh,ht:(long===2?HT2:HT1)[kind]});
    }
    if(r.w>=6&&r.h>=6&&Math.random()<0.6){
      const tw=2,th=(r.w>=7&&r.h>=7)?2:1;const x0=r.x+Math.floor((r.w-tw)/2),y0=r.y+Math.floor((r.h-th)/2);
      let ok=true;
      for(let y=y0;y<y0+th;y++)for(let x=x0;x<x0+tw;x++){const lx=x-r.x,ly=y-r.y,i=I(x,y);
        if(g.reserved[i]||g.blocked[i])ok=false;
        if((r.doorSides.has('W')&&lx<3)||(r.doorSides.has('E')&&lx>r.w-4)||(r.doorSides.has('N')&&ly<3)||(r.doorSides.has('S')&&ly>r.h-4))ok=false;}
      if(ok){for(let y=y0;y<y0+th;y++)for(let x=x0;x<x0+tw;x++)g.blocked[I(x,y)]=1;g.furn.push({x:x0,y:y0,w:tw,h:th,ht:0.76});}
    }
  });
  {const leafDoors=[...g.leafBy.values()];g.leafBy=new Map();const keep=new Map(),cnt=a=>{let n=0;for(let i=0;i<a.length;i++)n+=a[i];return n;};
   const base=cnt(reach(true)); // a leaf may not cut off any tile, not even a dead-end pocket behind it
   const fits=d=>{if(!d.leafKey)return true;keep.set(d.leafKey,d);g.leafBy=keep;d.o=1; // accepted leaves stay open while the next one is tested
     const seen=reach(true);if(cnt(seen)<base||g.doors.some(q=>!seen[q.i1]||!seen[q.i2])){keep.delete(d.leafKey);d.o=0;return false;}return true;};
   for(const d of leafDoors){ // a leaf that would cut the building tries the other hinge / swing; if none fits it is a pocket (sliding) door
     const f0=d.flip,s0=d.swA;if([[f0,s0],[f0,!s0],[!f0,s0],[!f0,!s0]].some(([f,sw],k)=>{if(k)setLeaf(d,f,sw);return fits(d);}))continue;
     setLeaf(d,f0,s0);d.leafKey=null;d.pocket=true;}
   for(const d of leafDoors)d.o=0;g.leafBy=keep;}
  {const seen=reach(true);
   if(g.doors.some(d=>!seen[d.i1]||!seen[d.i2])){for(const f of g.furn)for(let y=f.y;y<f.y+f.h;y++)for(let x=f.x;x<f.x+f.w;x++)g.blocked[I(x,y)]=0;g.furn=[];}
   const s2=reach(true);if(g.doors.some(d=>!s2[d.i1]||!s2[d.i2]))return genMap();}

  // labels: R + floor + number, halls by floor, stairwells by floor
  for(let f=0;f<F;f++){let n=0,hn=0;
    g.rooms.filter(r=>bld(r.id)&&Math.floor(r.x/PW)===f).sort((a,b)=>a.y-b.y||a.x-b.x).forEach(r=>{r.f=f;
      r.label=r.stair?`STAIR ${f+1}F`:r.hall?`HALL ${f+1}${'ABCDEFGH'[hn++%8]}`:`R${f+1}${pad(++n)}`;});}

  // merged wall runs (only where a building room meets anything else)
  for(let y=0;y<=GH;y++){let run=null;
    for(let x=0;x<TW;x++){const up=y>0?g.rid[I(x,y-1)]:-1,dn=y<GH?g.rid[I(x,y)]:-1;
      const wall=up!==dn&&(bld(up)||bld(dn))&&!(y>0&&y<GH&&isDoor(I(x,y-1),I(x,y)));
      if(wall){if(!run)run=[x,y,x+1,y];else run[2]=x+1;}else if(run){g.segs.push(run);run=null;}}
    if(run)g.segs.push(run);}
  for(let x=0;x<=TW;x++){let run=null;
    for(let y=0;y<GH;y++){const l=x>0?g.rid[I(x-1,y)]:-1,r=x<TW?g.rid[I(x,y)]:-1;
      const wall=l!==r&&(bld(l)||bld(r))&&!(x>0&&x<TW&&isDoor(I(x-1,y),I(x,y)));
      if(wall){if(!run)run=[x,y,x,y+1];else run[3]=y+1;}else if(run){g.segs.push(run);run=null;}}
    if(run)g.segs.push(run);}
  return g;
}

/* ---------- pathing ---------- */
const teamAllowed=i=>G.rooms[G.rid[i]].cleared&&!G.blocked[i];
function enemyAllowed(i){const r=G.rooms[G.rid[i]];if(!r||r.id<=1||r.cleared||G.blocked[i])return false;
  if(team.clearing&&team.room===r)return false;return true;}
const DIR8=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
function bfs(start,allowed){
  const N=G.N,dist=new Int32Array(N).fill(-1),prev=new Int32Array(N).fill(-1),q=new Int32Array(N);
  let h=0,t=0;dist[start]=0;q[t++]=start;
  while(h<t){const i=q[h++],x=i%G.TW,y=(i/G.TW)|0;
    for(const [dx,dy] of DIR8){const nx=x+dx,ny=y+dy;if(!inB(nx,ny))continue;const j=ny*G.TW+nx;
      if(dist[j]>=0||!allowed(j))continue;
      if(dx&&dy){if(!diagOK(x,y,dx,dy)||!allowed(y*G.TW+nx)||!allowed(ny*G.TW+x))continue;}
      else if(!open(x,y,dx,dy))continue;
      dist[j]=dist[i]+1;prev[j]=i;q[t++]=j;}
    const p=G.portal[i];if(p>=0&&dist[p]<0&&allowed(p)){dist[p]=dist[i]+2;prev[p]=i;q[t++]=p;}}
  return {dist,prev};
}
function clearLine(x1,z1,x2,z2,allowed){
  const dx=x2-x1,dz=z2-z1,len=Math.hypot(dx,dz);if(len<1e-3)return true;
  const px=-dz/len,pz=dx/len,steps=Math.ceil(len/0.12);const start=tileIdx(x1,z1);
  for(const off of [-0.24,0,0.24]){
    let prev=tileIdx(x1+px*off,z1+pz*off);
    for(let k=1;k<=steps;k++){const t=k/steps,sx=x1+dx*t+px*off,sz=z1+dz*t+pz*off,i=tileIdx(sx,sz);
      if(i<0)return false;
      if(i!==prev){if(prev<0)return false;const ddx=ix(i)-ix(prev),ddy=iy(i)-iy(prev);
        if(ddx&&ddy){if(!diagOK(ix(prev),iy(prev),ddx,ddy)||!allowed(iy(prev)*G.TW+ix(i))||!allowed(iy(i)*G.TW+ix(prev)))return false;}
        else if(!transI(prev,i))return false;
        if(i!==start&&!allowed(i))return false;prev=i;}}}
  return true;
}
function smooth(sx,sz,pts,allowed){
  const out=[];let cx=sx,cz=sz,i=0;
  while(i<pts.length){let j=pts.length-1;while(j>i&&!clearLine(cx,cz,pts[j][0],pts[j][1],allowed))j--;
    out.push(pts[j]);cx=pts[j][0];cz=pts[j][1];i=j+1;}
  return out;
}
/* waypoint list; a {jump} entry moves the walker onto another floor's page at the top of a flight */
function pathTo(sx,sz,tx,tz,allowed,raw=false){
  let si=tileIdx(sx,sz),ti=tileIdx(tx,tz);if(si<0||ti<0)return null;if(si===ti)return [[tx,tz]];
  const {dist,prev}=bfs(si,allowed);
  if(dist[ti]<0){ // unreachable: head for the closest reachable spot on the target's floor
    const tf=floorOf(tx);let best=-1,bd=1e9;
    for(let i=0;i<G.N;i++)if(dist[i]>=0){const c=tc(i);if(floorOf(c[0])!==tf)continue;const d=Math.hypot(c[0]-tx,c[1]-tz);if(d<bd){bd=d;best=i;}}
    if(best<0)return null;ti=best;[tx,tz]=tc(best);if(si===ti)return [[tx,tz]];}
  const tiles=[];for(let i=ti;i!==si;i=prev[i])tiles.push(i);tiles.reverse();
  const out=[];let seg=[],cur=[sx,sz],pt=si;
  const sm_=(x,z,pts)=>raw?pts:smooth(x,z,pts,allowed);
  const flush_=()=>{if(!seg.length)return;const pts=seg.map(tc);const sm=sm_(cur[0],cur[1],pts);out.push(...sm);cur=sm[sm.length-1];seg=[];};
  for(const i of tiles){if(G.portal[pt]===i){flush_();const c=tc(i);out.push({jump:c});cur=c;}else seg.push(i);pt=i;}
  if(seg.length){const pts=seg.map(tc);pts[pts.length-1]=[tx,tz];out.push(...sm_(cur[0],cur[1],pts));}
  else out.push([tx,tz]);
  return out;
}
function goTo(op,tx,tz,spd,allowed=teamAllowed){op.spd=spd;op.wp=pathTo(op.x,op.z,tx,tz,allowed)||[[tx,tz]];}
function eGoTo(e,tx,tz,spd){const p=pathTo(e.x,e.z,tx,tz,enemyAllowed);if(!p)return false;e.wp=p;e.spd=spd;e.goal=[tx,tz];return true;}

/* vision: closed doors block sight (ign = treat every doorway as open) */
function seeEdge(x,y,dx,dy,ign){if(!open(x,y,dx,dy,true))return false;if(ign)return true;
  const i1=y*G.TW+x,i2=(y+dy)*G.TW+x+dx;if(G.rid[i1]===G.rid[i2])return true;
  const d=G.doorByKey.get(dkey(i1,i2));return !d||d.o>LEAF_SOLID;}
function seeTrans(x1,y1,x2,y2,ign){const dx=x2-x1,dy=y2-y1;if(!dx&&!dy)return true;
  if(Math.abs(dx)>1||Math.abs(dy)>1)return false;
  if(!dx||!dy)return seeEdge(x1,y1,dx,dy,ign);
  return (seeEdge(x1,y1,dx,0,ign)&&seeEdge(x1+dx,y1,0,dy,ign))||(seeEdge(x1,y1,0,dy,ign)&&seeEdge(x1,y1+dy,dx,0,ign));}
function rayLen(x,z,a,max,ign){
  const c=Math.cos(a),s=Math.sin(a);let px=Math.floor(x),pz=Math.floor(z);
  for(let d=0.1;d<max;d+=0.1){const gx=Math.floor(x+c*d),gz=Math.floor(z+s*d);
    if(gx!==px||gz!==pz){if(!inB(gx,gz)||!seeTrans(px,pz,gx,gz,ign))return d;px=gx;pz=gz;}}
  return max;
}
const los=(x1,z1,x2,z2,ign)=>{if(floorOf(x1)!==floorOf(x2))return false;const d=Math.hypot(x2-x1,z2-z1);return rayLen(x1,z1,Math.atan2(z2-z1,x2-x1),d,ign)>=d-0.12;};

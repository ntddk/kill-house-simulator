
/* ---------- camera + projection (world space: pages stacked FH apart) ---------- */
const NEAR=0.18;
let VW=0,VH=0,DPR=1,CX=0,CY=0,FOC=1,vignette=null;
let E=[0,0,0],F=[0,0,1],R=[1,0,0],U=[0,1,0];
const cam={yaw:rnd(0,TAU),eye:[0,30,30],look:[0,0,0],fov:0.9,fog:30,rate:0.04,autoT:0,ai:0,mode:'',blend:1,ch:0};
const AUTO=[['orbit',26],['follow',26],['helmet',22],['chase',18],['plan',12]];
const CAM_MODES=['auto','orbit','follow','chase','helmet','plan'];
function headW(o){const b=o.body,w=wpos(o.x,o.z),cr=b?b.crouch:0,L=b?b.lean:0.1,c=Math.cos(o.h),s=Math.sin(o.h);
  return [w[0]+c*(Math.sin(L)*0.62+0.06),w[1]+0.95-0.33*cr+Math.cos(L)*0.5+0.2,w[2]+s*(Math.sin(L)*0.62+0.06)];}
function camGoal(mode){
  const fl=curFloor(),by=fl*FH,cx=M+G.BW/2,cz=M+G.BH/2,diag=Math.hypot(G.BW,G.BH);
  const fit=(diag/2)/Math.tan(0.45)*1.02;
  const orb=(tx,ty,tz,dist,pitch)=>{const cp=Math.cos(pitch),sp=Math.sin(pitch);
    return [tx+dist*cp*Math.sin(cam.yaw),ty+dist*sp,tz+dist*cp*Math.cos(cam.yaw)];};
  const lead=team.ops[0],lw=wpos(lead.x,lead.z),c=Math.cos(cam.ch),s=Math.sin(cam.ch);
  if(mode==='follow'){let x=0,y=0,z=0;team.ops.forEach(o=>{const w=wpos(o.x,o.z);x+=w[0];y+=w[1];z+=w[2];});const n=team.ops.length;x/=n;y/=n;z/=n;const d=Math.max(8,fit*0.34);
    return {eye:orb(x,y+0.6,z,d,0.5),look:[x,y+0.6,z],fov:0.95,fog:d,rate:0.075,speed:1.6};}
  if(mode==='plan')return {eye:orb(cx,by,cz,fit*0.96,1.42),look:[cx,by,cz],fov:0.9,fog:fit,rate:0,speed:1};
  if(mode==='chase')
    return {eye:[lw[0]-c*2.4-s*0.55,lw[1]+2.2,lw[2]-s*2.4+c*0.55],look:[lw[0]+c*3.2,lw[1]+0.95,lw[2]+s*3.2],fov:1.1,fog:9,rate:0,speed:4};
  if(mode==='helmet'){const h=headW(lead);
    return {eye:h,look:[h[0]+c*6,h[1]-0.38+0.25*clamp((lead.pose-0.55)/0.45,0,1),h[2]+s*6],
      fov:1.32-0.24*clamp((lead.pose-0.6)/0.4,0,1),fog:8,rate:0,speed:9};}
  return {eye:orb(cx,by,cz,fit,0.7),look:[cx,by,cz],fov:0.9,fog:fit,rate:0.045,speed:1};
}
function updateCam(dt,snap){
  let mode=S.cam;
  if(mode==='auto'){cam.autoT+=dt;if(cam.autoT>AUTO[cam.ai][1]){cam.autoT=0;cam.ai=(cam.ai+1)%AUTO.length;}mode=AUTO[cam.ai][0];}
  if(mode!==cam.mode){cam.mode=mode;cam.blend=snap?1:0;}
  cam.blend=Math.min(1,cam.blend+dt/2.6);
  const lead=team.ops[0];
  if(snap)cam.ch=lead.h;else cam.ch+=angDiff(cam.ch,lead.h)*Math.min(1,dt*(mode==='helmet'?5:2.2));
  cam.yaw+=cam.rate*dt*(RM?0.3:1);
  const g=camGoal(mode);
  cam.rate+=(g.rate-cam.rate)*Math.min(1,dt*0.8);
  const sp=0.9+(g.speed-0.9)*cam.blend*cam.blend,k=snap?1:1-Math.exp(-dt*sp);
  for(let i=0;i<3;i++){cam.eye[i]+=(g.eye[i]-cam.eye[i])*k;cam.look[i]+=(g.look[i]-cam.look[i])*k;}
  cam.fov+=(g.fov-cam.fov)*k;cam.fog+=(g.fog-cam.fog)*k;
}
function setupCam(){
  E=cam.eye.slice();
  const fx=cam.look[0]-E[0],fy=cam.look[1]-E[1],fz=cam.look[2]-E[2],fl=Math.hypot(fx,fy,fz)||1;F=[fx/fl,fy/fl,fz/fl];
  let rx=-F[2],rz=F[0];const rl=Math.hypot(rx,rz);if(rl<1e-4){rx=1;rz=0;}else{rx/=rl;rz/=rl;}R=[rx,0,rz];
  U=[R[1]*F[2]-R[2]*F[1],R[2]*F[0]-R[0]*F[2],R[0]*F[1]-R[1]*F[0]];
  FOC=(Math.min(VW,VH)/2)/Math.tan(cam.fov/2);CX=VW/2;CY=VH/2;
}
function P3(x,y,z){const dx=x-E[0],dy=y-E[1],dz=z-E[2],cz=dx*F[0]+dy*F[1]+dz*F[2];if(cz<NEAR)return null;
  return [CX+(dx*R[0]+dy*R[1]+dz*R[2])*FOC/cz,CY-(dx*U[0]+dy*U[1]+dz*U[2])*FOC/cz,cz];}

const STY={
  grid:{c:'#16283a',w:1,a:1},
  slab:{c:'#3c5a6c',w:1,a:.8},
  funnel:{c:COL.hostile,w:1,a:.45,dash:[3,5]},
  cleared:{c:COL.clear,w:1,a:.4},
  target:{c:'#e6f2f8',w:1.2,a:.6,dash:[6,4]},
  furn:{c:'#3e596b',w:1,a:1},
  stair:{c:'#7c9fb3',w:1,a:.9},
  door:{c:'#86aabd',w:1,a:.85},
  wall:{c:'#557a90',w:1,a:.95},
  wallTop:{c:'#a4c6d8',w:1.15,a:1},
  fanLow:{c:COL.team,w:1,a:.09},
  fan:{c:COL.team,w:1,a:.2},
  fanAim:{c:COL.team,w:1.1,a:.42},
  threat:{c:COL.hostile,w:1.3,a:.8,dash:[4,3]},
  cover:{c:COL.team,w:1.4,a:.9},
  coverLink:{c:COL.team,w:1,a:.3,dash:[2,5]},
  muzzle:{c:COL.team,w:1,a:.45},
  unseen:{c:COL.hostile,w:1,a:.32},
  down:{c:'#8e4038',w:1.1,a:.9},
  enemy:{c:COL.hostile,w:1.3,a:.62},
  enemyA:{c:COL.hostile,w:1.5,a:1},
  mark:{c:COL.clear,w:1.8,a:1},
  nade:{c:'#e8f3f8',w:1.3,a:1},
  team:{c:COL.team,w:1.05,a:.8},
  dbgPath:{c:'#8fd3ff',w:1,a:.7,dash:[2,3]},
  dbgSlot:{c:'#8fd3ff',w:1.4,a:.9}
};
const BUCK=[1,.68,.42],BW_=[1.3,1,.85],TIER=[1,.42,.08];
const batches={};for(const k in STY)batches[k]=[0,1,2].map(()=>[[],[],[]]);
let fogA=20,fogB=30,viewFloor=0,debug=false;
const tierOf=f=>f===viewFloor?0:f<viewFloor?1:2;
function L3w(k,x1,y1,z1,x2,y2,z2,tier=0){
  const ax=x1-E[0],ay=y1-E[1],az=z1-E[2],bx=x2-E[0],by=y2-E[1],bz=z2-E[2];
  let ad=ax*F[0]+ay*F[1]+az*F[2],bd=bx*F[0]+by*F[1]+bz*F[2];
  if(ad<NEAR&&bd<NEAR)return;
  let ah=ax*R[0]+ay*R[1]+az*R[2],av=ax*U[0]+ay*U[1]+az*U[2],bh=bx*R[0]+by*R[1]+bz*R[2],bv=bx*U[0]+by*U[1]+bz*U[2];
  if(ad<NEAR){const t=(NEAR-ad)/(bd-ad);ah+=(bh-ah)*t;av+=(bv-av)*t;ad=NEAR;}
  else if(bd<NEAR){const t=(NEAR-bd)/(ad-bd);bh+=(ah-bh)*t;bv+=(av-bv)*t;bd=NEAR;}
  const d=(ad+bd)*.5,b=d<fogA?0:d<fogB?1:2;
  batches[k][tier][b].push(CX+ah*FOC/ad,CY-av*FOC/ad,CX+bh*FOC/bd,CY-bv*FOC/bd);
}
/* page coordinates: x picks the floor, y is height above that floor */
function L3(k,x1,y1,z1,x2,y2,z2){const f=floorOf(Math.min(x1,x2)+1e-6),ox=f*G.PW,oy=f*FH;L3w(k,x1-ox,y1+oy,z1,x2-ox,y2+oy,z2,tierOf(f));}
function flush(){
  for(const k in STY){const s=STY[k];ctx.strokeStyle=s.c;ctx.setLineDash(s.dash||[]);
    for(let t=2;t>=0;t--)for(let b=0;b<3;b++){const a=batches[k][t][b];if(!a.length)continue;ctx.globalAlpha=s.a*BUCK[b]*TIER[t];ctx.lineWidth=s.w*BW_[b];ctx.beginPath();
      for(let i=0;i<a.length;i+=4){ctx.moveTo(a[i],a[i+1]);ctx.lineTo(a[i+2],a[i+3]);}ctx.stroke();a.length=0;}}
  ctx.setLineDash([]);ctx.globalAlpha=1;
}
function box3(k,x0,x1,z0,z1,y0,y1){
  L3(k,x0,y0,z0,x1,y0,z0);L3(k,x1,y0,z0,x1,y0,z1);L3(k,x1,y0,z1,x0,y0,z1);L3(k,x0,y0,z1,x0,y0,z0);
  L3(k,x0,y1,z0,x1,y1,z0);L3(k,x1,y1,z0,x1,y1,z1);L3(k,x1,y1,z1,x0,y1,z1);L3(k,x0,y1,z1,x0,y1,z0);
  L3(k,x0,y0,z0,x0,y1,z0);L3(k,x1,y0,z0,x1,y1,z0);L3(k,x1,y0,z1,x1,y1,z1);L3(k,x0,y0,z1,x0,y1,z1);
}
function rectLine(k,x0,z0,x1,z1,y){L3(k,x0,y,z0,x1,y,z0);L3(k,x1,y,z0,x1,y,z1);L3(k,x1,y,z1,x0,y,z1);L3(k,x0,y,z1,x0,y,z0);}
function wallBox(ax,az,bx,bz,ox,oz,y0,y1){
  for(const sg of [1,-1]){const px=ox*sg,pz=oz*sg;
    L3('wall',ax+px,y0,az+pz,bx+px,y0,bz+pz);L3('wallTop',ax+px,y1,az+pz,bx+px,y1,bz+pz);
    L3('wall',ax+px,y0,az+pz,ax+px,y1,az+pz);L3('wall',bx+px,y0,bz+pz,bx+px,y1,bz+pz);}
  L3('wallTop',ax+ox,y1,az+oz,ax-ox,y1,az-oz);L3('wallTop',bx+ox,y1,bz+oz,bx-ox,y1,bz-oz);
  L3('wall',ax+ox,y0,az+oz,ax-ox,y0,az-oz);L3('wall',bx+ox,y0,bz+oz,bx-ox,y0,bz-oz);
}
function fillQuad(x0,z0,x1,z1,style,alpha){
  const f=floorOf(x0+1e-6),ox=f*G.PW,y=f*FH,t=TIER[tierOf(f)];
  const pts=[P3(x0-ox,y,z0),P3(x1-ox,y,z0),P3(x1-ox,y,z1),P3(x0-ox,y,z1)];if(pts.some(p=>!p))return;
  ctx.globalAlpha=alpha*t;ctx.fillStyle=style;ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<4;i++)ctx.lineTo(pts[i][0],pts[i][1]);ctx.closePath();ctx.fill();ctx.globalAlpha=1;
}

/* ---------- figures: faceted mannequins in the spirit of SUPERHOT ---------- */
const V={sub:(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],add:(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],mul:(a,k)=>[a[0]*k,a[1]*k,a[2]*k],
  dot:(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  nrm:a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l];}};
function rot(p,ax,a){const c=Math.cos(a),s=Math.sin(a),d=V.dot(ax,p),cr=V.cross(ax,p);
  return [p[0]*c+cr[0]*s+ax[0]*d*(1-c),p[1]*c+cr[1]*s+ax[1]*d*(1-c),p[2]*c+cr[2]*s+ax[2]*d*(1-c)];}
/* weapon posture, relative to the chest: -0.4 = muzzle depressed (~68° down, meets the floor ~0.9 m out: a teammate right in front),
   0 = low ready (butt in the shoulder, muzzle ~50° down, meets the floor ~1.6 m out),
   0.55 = compressed ready (muzzle ~20° down, on the danger area), 1 = shouldered, on target.
   hi blends toward high ready: butt low under the armpit, muzzle ~55° up, well over teammates' heads. */
const POSES=[[-0.4,[0.0,0.06,1.22],1.18],[0,[0.02,0.07,1.25],0.87],[0.55,[0.08,0.09,1.36],0.34],[1,[0.11,0.1,1.45],0.0]],HIGHP=[[0.14,0.12,1.17],-0.98];
/* SUL: weapon pulled into the chest, muzzle almost straight down at the feet — for moving and standing shoulder to shoulder */
const TUCKP=[[-0.01,0.14,1.31],1.4];
function poseAt(p,hi,tk=0){const j=p>0.55?2:p>0?1:0,a=POSES[j],b=POSES[j+1],t=clamp((p-a[0])/(b[0]-a[0]),0,1),l=(u,v)=>u+(v-u)*t;
  let pv=[l(a[1][0],b[1][0]),l(a[1][1],b[1][1]),l(a[1][2],b[1][2])],pitch=l(a[2],b[2]);
  if(hi>0){pv=pv.map((v,i)=>v+(HIGHP[0][i]-v)*hi);pitch+=(HIGHP[1]-pitch)*hi;}
  if(tk>0){pv=pv.map((v,i)=>v+(TUCKP[0][i]-v)*tk);pitch+=(TUCKP[1]-pitch)*tk;}
  return {pv,pitch};}
/* side: +1 firing from the right shoulder, -1 from the left (a right-hander firing left-handed around a left-hand corner) */
function rifleAt(p,k,dn=0,hi=0,tk=0,side=1){const {pv,pitch}=poseAt(p,hi,tk),cp=Math.cos(pitch),sp=Math.sin(pitch);
  return [pv[0]+cp*k-sp*dn,pv[1]*side,pv[2]-sp*k-cp*dn];}
function chestW(o){const b=o.body,w=wpos(o.x,o.z),yaw=b?b.yaw:o.h,L=b?b.lean:0.1,RL=b?b.roll||0:0,cr=b?b.crouch:0,c=Math.cos(yaw),s=Math.sin(yaw),k=Math.sin(RL)*0.42;
  return {ch:[w[0]+c*Math.sin(L)*0.5-s*k,w[1]+0.95-0.33*cr+Math.cos(L)*Math.cos(RL)*0.5,w[2]+s*Math.sin(L)*0.5+c*k],c,s};}
function muzzle(o){const {ch,c,s}=chestW(o),q=rifleAt(o.pose||0,RIFLE_LEN,0,o.hi||0,o.tuck||0,o.shoulder??1);return [ch[0]+c*q[0]-s*q[1],ch[1]+q[2]-1.44,ch[2]+s*q[0]+c*q[1]];}
const stanceName=(p,hi,tk=0)=>tk>0.5?'SUL':hi>0.5?'HIGH':p>=0.95?'AIM':p>=0.4?'READY':'LOW';

function prism(out,A,B,rA,rB,n,col,bv,bw,sx=1,sy=1){
  const u=V.nrm(V.sub(B,A));
  if(!bv){const ref=Math.abs(u[1])<0.9?[0,1,0]:[1,0,0];bv=V.nrm(V.cross(u,ref));bw=V.cross(u,bv);}
  const ring=(P,r)=>{const a=[];for(let i=0;i<n;i++){const t=i/n*TAU+Math.PI/n,cc=Math.cos(t)*r*sx,ss=Math.sin(t)*r*sy;
    a.push([P[0]+bv[0]*cc+bw[0]*ss,P[1]+bv[1]*cc+bw[1]*ss,P[2]+bv[2]*cc+bw[2]*ss]);}return a;};
  const ra=ring(A,rA),rb=ring(B,rB),C=V.mul(V.add(A,B),0.5);
  for(let i=0;i<n;i++){const j=(i+1)%n;out.push({pts:[ra[i],ra[j],rb[j],rb[i]],c:C,col});}
  out.push({pts:ra.slice().reverse(),c:C,col});out.push({pts:rb,c:C,col});
}
/* two-bone IK: joint position for a limb from A reaching T, bending toward pole */
function ik2(A,T,l1,l2,pole){let d=V.sub(T,A),dl=Math.hypot(d[0],d[1],d[2])||1e-3;const mx=(l1+l2)*0.999;
  if(dl>mx){d=V.mul(d,mx/dl);dl=mx;}dl=Math.max(dl,Math.abs(l1-l2)+1e-3);
  const dir=V.mul(d,1/dl),a=(l1*l1-l2*l2+dl*dl)/(2*dl),h=Math.sqrt(Math.max(0,l1*l1-a*a));
  const pp=V.nrm(V.sub(pole,V.mul(dir,V.dot(pole,dir))));
  return V.add(V.add(A,V.mul(dir,a)),V.mul(pp,h));}
function reachTo(A,T,mx){const d=V.sub(T,A),l=Math.hypot(d[0],d[1],d[2]);return l>mx?V.add(A,V.mul(d,mx/l)):T;}
function buildFigure(out,o){
  const b=o.body||(o.body=newBody(o));
  const f=floorOf(o.x),po=f*G.PW,base=wpos(o.x,o.z);
  const cy=Math.cos(b.yaw),sy=Math.sin(b.yaw),chh=Math.cos(b.hip),shh=Math.sin(b.hip);
  const Fw=[cy,0,sy],Sd=[-sy,0,cy],Fh=[chh,0,shh],Sh=[-shh,0,chh];
  const feet=b.feet.map(ft=>({x:ft.p[0]-po,z:ft.p[1],y:floorY(ft.p[0],ft.p[1])+ft.h,yaw:ft.yaw}));
  let u=0;if(b.swing>=0){const ft=b.feet[b.swing];u=clamp(ft.t/ft.T,0,1);}
  const sp=b.sp,mk=Math.min(1,sp/1.4);
  // pelvis: lowest at heel strike, highest mid-stance; weight shifts over the planted foot
  const pelY=base[1]+0.95-0.33*b.crouch-(b.swing>=0?0.03*mk*(1-Math.sin(Math.PI*u)):sp>0.2?0.03*mk:0);
  const stance=b.swing>=0?1-b.swing:-1;
  const sway=(stance<0?0:(stance===0?-1:1)*Math.sin(Math.PI*u)*0.03*Math.min(1,sp))+0.012*Math.sin(b.t*0.5+o.seed);
  const RL=b.roll||0,hipOut=-Math.sin(RL)*0.08; // leaning: hips stay back behind cover, the upper body bends out
  const pel=[base[0]+Sh[0]*sway+Sd[0]*hipOut,pelY,base[2]+Sh[2]*sway+Sd[2]*hipOut];
  for(let i=0;i<2;i++){const sd=i===0?-1:1,hip=[pel[0]+Sh[0]*0.1*sd,pel[1]-0.05,pel[2]+Sh[2]*0.1*sd],an=[feet[i].x,feet[i].y+0.08,feet[i].z];
    const hd=Math.hypot(an[0]-hip[0],an[2]-hip[2]),mx=an[1]+Math.sqrt(Math.max(0,0.87*0.87-hd*hd));if(hip[1]>mx)pel[1]-=hip[1]-mx;}
  const L=b.lean,chest=[pel[0]+Fw[0]*Math.sin(L)*0.5+Sd[0]*Math.sin(RL)*0.5,pel[1]+Math.cos(L)*Math.cos(RL)*0.5+0.006*Math.sin(b.t*1.7),pel[2]+Fw[2]*Math.sin(L)*0.5+Sd[2]*Math.sin(RL)*0.5];
  const side=o.shoulder??1;
  const Rf=(k,dn=0)=>{const q=rifleAt(o.pose||0,k,dn,o.hi||0,o.tuck||0,side);return [chest[0]+Fw[0]*q[0]+Sd[0]*q[1],chest[1]+q[2]-1.44,chest[2]+Fw[2]*q[0]+Sd[2]*q[1]];};
  const cw=clamp(((o.pose||0)-0.6)/0.4,0,1)*(1-(o.hi||0))*(1-(o.tuck||0)); // cheek weld as the gun comes up
  // hips, torso, shoulders
  prism(out,[pel[0],pel[1]-0.1,pel[2]],[pel[0],pel[1]+0.06,pel[2]],0.15,0.155,6,'body',Fh,Sh,0.7,1);
  prism(out,[pel[0],pel[1]+0.04,pel[2]],chest,0.15,0.2,6,'body',Fw,Sd,0.6,1);
  const neck=[chest[0]+Fw[0]*0.02+Sd[0]*Math.sin(RL)*0.1,chest[1]+0.06,chest[2]+Fw[2]*0.02+Sd[2]*Math.sin(RL)*0.1];
  prism(out,chest,neck,0.12,0.06,6,'body',Fw,Sd,0.8,1);
  // legs: IK from hip to the planted (or swinging) foot, knees over toes
  for(let i=0;i<2;i++){const sd=i===0?-1:1,ft=feet[i];
    const hip=[pel[0]+Sh[0]*0.1*sd,pel[1]-0.05,pel[2]+Sh[2]*0.1*sd],an=[ft.x,ft.y+0.08,ft.z];
    const kn=ik2(hip,an,0.45,0.43,[Fh[0]+Sh[0]*0.15*sd,0.05,Fh[2]+Sh[2]*0.15*sd]),ak=reachTo(hip,an,0.879);
    prism(out,hip,kn,0.08,0.06,5,'body');prism(out,kn,ak,0.058,0.04,5,'body');
    const fc=Math.cos(ft.yaw),fs=Math.sin(ft.yaw);
    prism(out,[ak[0]-fc*0.05,ak[1]-0.04,ak[2]-fs*0.05],[ak[0]+fc*0.16,ak[1]-0.05,ak[2]+fs*0.16],0.045,0.038,4,'body');}
  // arms: IK from the shoulders to the pistol grip and the handguard
  const shR=[chest[0]+Sd[0]*0.19,chest[1]-0.02,chest[2]+Sd[2]*0.19],shL=[chest[0]-Sd[0]*0.19,chest[1]-0.02,chest[2]-Sd[2]*0.19];
  const grip=Rf(0.06,0.1);let hL=Rf(0.47,0.03); // hL: the support hand (it does the taps and door handles)
  if(o.tap){const u=clamp(o.tap.t/o.tap.T,0,1),w=clamp(Math.sin(Math.PI*u)*1.7,0,1),sh=shoulderToward(o.tap.to,o);
    const press=0.025*Math.sin(Math.PI*clamp((u-0.35)/0.3,0,1));hL=[hL[0]+(sh[0]-hL[0])*w,hL[1]+(sh[1]+0.05-press-hL[1])*w,hL[2]+(sh[2]-hL[2])*w];}
  if(o.reach&&!o.tap){const h=toW(o.reach[0],1.02,o.reach[1]);const d=Math.hypot(h[0]-shL[0],h[2]-shL[2]);
    if(d<1.1){const w=0.85;hL=[hL[0]+(h[0]-hL[0])*w,hL[1]+(h[1]-hL[1])*w,hL[2]+(h[2]-hL[2])*w];}} // support hand on the door handle
  let hR=grip;if(side<0){hR=hL;hL=grip;} // left shoulder: the hands swap roles
  const eR=ik2(shR,hR,0.33,0.32,[Sd[0]*0.7-Fw[0]*0.2,-1,Sd[2]*0.7-Fw[2]*0.2]),eL=ik2(shL,hL,0.33,0.32,[-Sd[0]*0.4,-1,-Sd[2]*0.4]);
  prism(out,shR,eR,0.055,0.045,5,'body');prism(out,eR,reachTo(shR,hR,0.648),0.045,0.035,5,'body');
  prism(out,shL,eL,0.055,0.045,5,'body');prism(out,eL,reachTo(shL,hL,0.648),0.045,0.035,5,'body');
  const hc=[neck[0]+Fw[0]*(0.03+0.05*cw)+Sd[0]*0.04*cw*side,neck[1]+0.13-0.04*cw,neck[2]+Fw[2]*(0.03+0.05*cw)+Sd[2]*0.04*cw*side];
  out.push({sphere:true,c:hc,r:0.115,col:'body'});
  prism(out,Rf(-0.18,0.01),Rf(0.42,0.01),0.036,0.03,4,'gun');
  prism(out,Rf(0.42),Rf(RIFLE_LEN),0.013,0.013,3,'gun');
  prism(out,Rf(0.27,0.03),Rf(0.25,0.17),0.024,0.02,4,'gun');
}
function shatter(e,op){
  const faces=[];buildFigure(faces,e);
  const w=wpos(e.x,e.z),c=[w[0],w[1]+1.0,w[2]],ow=wpos(op.x,op.z),away=V.nrm([w[0]-ow[0],0,w[2]-ow[2]]),tris=[];
  for(const f of faces){if(f.sphere){for(const t of sphereTris(f.c,f.r))tris.push([...t,'body']);continue;}
    for(let i=1;i+1<f.pts.length;i++)tris.push([f.pts[0],f.pts[i],f.pts[i+1],f.col]);}
  for(let i=tris.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[tris[i],tris[j]]=[tris[j],tris[i]];}
  for(const t of tris.slice(0,110)){
    const g=V.mul(V.add(V.add(t[0],t[1]),t[2]),1/3),off=[V.sub(t[0],g),V.sub(t[1],g),V.sub(t[2],g)];
    const out=V.nrm(V.sub(g,c));
    const v=V.add(V.add(V.mul(out,rnd(0.8,2.2)),V.mul(away,rnd(1.2,3.2))),[rnd(-0.4,0.4),rnd(0.6,2.4),rnd(-0.4,0.4)]);
    shards.push({g,off,v,ax:V.nrm([rnd(-1,1),rnd(-1,1),rnd(-1,1)]),w:rnd(5,14),life:rnd(2.2,3.4),col:t[3],floor:w[1],f:floorOf(e.x)});
  }
}
function fan(op,max){
  const p=op.pose||0,up=(op.hi||0)>0.5||(op.tuck||0)>0.5,k=up||p<0.4?'fanLow':p>=0.88?'fanAim':'fan',len=up||p<0.4?Math.min(max,3):max;
  const N=11,spread=p>=0.88?0.36:0.48;let prev=null;
  for(let i=0;i<N;i++){const a=op.h-spread+2*spread*i/(N-1),L=rayLen(op.x,op.z,a,len);
    const q=[op.x+Math.cos(a)*L,op.z+Math.sin(a)*L];
    if(i===0||i===N-1)L3(k,op.x,0.03,op.z,q[0],0.03,q[1]);
    if(prev)L3(k,prev[0],0.03,prev[1],q[0],0.03,q[1]);prev=q;}
}
/* filled, flat-shaded, depth-sorted polygons for bodies and shards */
const LIGHT=V.nrm([0.35,0.85,0.4]),PT=[1,0.6,0.25];let POLYS=[];
function polyW(pts,rgb,alpha,edge,cull,center,tier){
  const cs=[];for(const p of pts){const dx=p[0]-E[0],dy=p[1]-E[1],dz=p[2]-E[2],cz=dx*F[0]+dy*F[1]+dz*F[2];if(cz<NEAR)return;
    cs.push([CX+(dx*R[0]+dy*R[1]+dz*R[2])*FOC/cz,CY-(dx*U[0]+dy*U[1]+dz*U[2])*FOC/cz,cz]);}
  let n=V.nrm(V.cross(V.sub(pts[1],pts[0]),V.sub(pts[2],pts[0])));
  const g=[0,0,0];for(const p of pts){g[0]+=p[0];g[1]+=p[1];g[2]+=p[2];}g[0]/=pts.length;g[1]/=pts.length;g[2]/=pts.length;
  if(center&&V.dot(n,V.sub(g,center))<0)n=V.mul(n,-1);
  if(cull&&V.dot(n,V.sub(E,g))<=0)return;
  const lit=0.4+0.6*Math.max(0,cull?V.dot(n,LIGHT):Math.abs(V.dot(n,LIGHT)));
  let d=0;for(const q of cs)d+=q[2];d/=cs.length;const fog=(d<fogA?1:d<fogB?0.8:0.6)*PT[tier];
  POLYS.push({s:cs,d,fill:`rgba(${rgb[0]*lit|0},${rgb[1]*lit|0},${rgb[2]*lit|0},${(alpha*fog).toFixed(3)})`});
  if(edge)for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];L3w(edge,a[0],a[1],a[2],b[0],b[1],b[2],tier);}
}
/* sphere head: projected as a disc, shaded toward the light, painted in depth order with the facets */
function sphereW(c,r,rgb,alpha,edge,tier){
  const dx=c[0]-E[0],dy=c[1]-E[1],dz=c[2]-E[2],cz=dx*F[0]+dy*F[1]+dz*F[2];if(cz<NEAR+r)return;
  const sx=CX+(dx*R[0]+dy*R[1]+dz*R[2])*FOC/cz,sy=CY-(dx*U[0]+dy*U[1]+dz*U[2])*FOC/cz,sr=r*FOC/cz;
  const lx=LIGHT[0]*R[0]+LIGHT[1]*R[1]+LIGHT[2]*R[2],ly=LIGHT[0]*U[0]+LIGHT[1]*U[1]+LIGHT[2]*U[2];
  const gr=ctx.createRadialGradient(sx+lx*sr*0.45,sy-ly*sr*0.45,sr*0.08,sx,sy,sr);
  const col=k=>`rgb(${Math.min(255,rgb[0]*k)|0},${Math.min(255,rgb[1]*k)|0},${Math.min(255,rgb[2]*k)|0})`;
  gr.addColorStop(0,col(1.18));gr.addColorStop(0.55,col(0.82));gr.addColorStop(1,col(0.42));
  const fog=(cz<fogA?1:cz<fogB?0.8:0.6)*PT[tier];
  POLYS.push({disc:[sx,sy,sr],d:cz,fill:gr,a:Math.min(1,alpha*1.25)*fog,edge:STY[edge].c,ea:STY[edge].a*fog*0.9});
}
function sphereTris(c,r){const out=[],la=4,lo=7,P=(i,j)=>{const t=Math.PI*i/la,p=TAU*j/lo;return [c[0]+r*Math.sin(t)*Math.cos(p),c[1]+r*Math.cos(t),c[2]+r*Math.sin(t)*Math.sin(p)];};
  for(let i=0;i<la;i++)for(let j=0;j<lo;j++){const a=P(i,j),b=P(i+1,j),cc=P(i+1,j+1),d=P(i,j+1);out.push([a,b,cc]);if(i>0)out.push([a,cc,d]);}return out;}
/* the shoulder of `who` nearest to `from`, in world space */
function shoulderToward(who,from){const {ch,c,s}=chestW(who),w=wpos(from.x,from.z),sd=[-s,0,c];
  const side=((w[0]-ch[0])*sd[0]+(w[2]-ch[2])*sd[2])>=0?1:-1;
  return [ch[0]+sd[0]*0.19*side-c*0.02,ch[1]-0.02,ch[2]+sd[2]*0.19*side-s*0.02];}
const PAL={
  team:{body:[255,181,71],gun:[20,24,30],a:0.55,edge:'team'},
  hostile:{body:[255,66,54],gun:[20,24,30],a:0.72,edge:'enemyA'},
  idle:{body:[196,58,50],gun:[20,24,30],a:0.5,edge:'enemy'},
  stunned:{body:[255,170,160],gun:[20,24,30],a:0.6,edge:'enemyA'}
};
function drawFigure(o,pal){const t=tierOf(floorOf(o.x));
  if(t===2){const w=wpos(o.x,o.z),dz=(w[0]-E[0])*F[0]+(w[1]+1-E[1])*F[1]+(w[2]-E[2])*F[2];if(dz<4)return;} // a floor above, too close to the lens
  const faces=[];buildFigure(faces,o);
  for(const f of faces)if(f.sphere)sphereW(f.c,f.r,pal.body,pal.a,pal.edge,t);else polyW(f.pts,f.col==='gun'?pal.gun:pal.body,f.col==='gun'?0.95:pal.a,pal.edge,true,f.c,t);}

/* ---------- render ---------- */
function resize(){
  DPR=Math.min(2,window.devicePixelRatio||1);VW=cv.clientWidth||innerWidth;VH=cv.clientHeight||innerHeight;
  cv.width=Math.round(VW*DPR);cv.height=Math.round(VH*DPR);ctx.setTransform(DPR,0,0,DPR,0,0);
  vignette=ctx.createRadialGradient(VW/2,VH*0.55,Math.min(VW,VH)*0.2,VW/2,VH/2,Math.max(VW,VH)*0.75);
  vignette.addColorStop(0,'rgba(18,34,48,0.55)');vignette.addColorStop(1,'rgba(7,11,16,0)');
  const r=mm.getBoundingClientRect();mm.width=Math.round(r.width*DPR);mm.height=Math.round(r.height*DPR);mctx.setTransform(DPR,0,0,DPR,0,0);
}
const P3i=(x,y,z)=>{const w=wpos(x,z);return P3(w[0],w[1]+y,w[2]);};
function render(time){
  ctx.fillStyle=COL.ground;ctx.fillRect(0,0,VW,VH);ctx.fillStyle=vignette;ctx.fillRect(0,0,VW,VH);
  setupCam();fogA=cam.fog*0.92;fogB=cam.fog*1.22;viewFloor=curFloor();
  const pov=cam.mode==='helmet'&&cam.blend>0.55?team.ops[0]:null;
  const tgt=team.room&&['move',...WORKING].includes(team.state)?team.room:null;
  // floor fills
  for(const r of G.rooms){if(r.id<=1)continue;
    if(r.cleared)fillQuad(r.x,r.y,r.x+r.w,r.y+r.h,COL.clear,0.06);
    else if(r===tgt)fillQuad(r.x,r.y,r.x+r.w,r.y+r.h,'#dfeef6',0.025+0.02*Math.sin(time*4));}
  // bodies and shards: filled, flat shaded, painted back to front
  POLYS=[];
  for(const e of enemies)if(e.alive)drawFigure(e,e.stunT>0&&Math.sin(time*30)>0?PAL.stunned:e.state==='idle'?PAL.idle:PAL.hostile);
  for(const o of team.ops)if(o!==pov)drawFigure(o,PAL.team);
  for(const s of shards){const a=Math.min(1,s.life/0.9)*0.85;polyW(s.off.map(p=>V.add(s.g,p)),s.col==='gun'?[40,44,50]:[255,66,54],a,null,false,null,tierOf(s.f));}
  POLYS.sort((a,b)=>b.d-a.d);
  for(const p of POLYS){
    if(p.disc){const [x,y,r]=p.disc;ctx.globalAlpha=p.a;ctx.fillStyle=p.fill;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();
      ctx.globalAlpha=p.ea;ctx.strokeStyle=p.edge;ctx.lineWidth=1;ctx.stroke();ctx.globalAlpha=1;continue;}
    ctx.fillStyle=p.fill;ctx.beginPath();ctx.moveTo(p.s[0][0],p.s[0][1]);for(let i=1;i<p.s.length;i++)ctx.lineTo(p.s[i][0],p.s[i][1]);ctx.closePath();ctx.fill();}
  // ground grid (floor 0) and slabs for the floors above
  for(let x=0;x<=G.GW;x++)L3('grid',x,0,0,x,0,G.GH);
  for(let z=0;z<=G.GH;z++)L3('grid',0,0,z,G.GW,0,z);
  for(let f=1;f<G.F;f++){const ox=f*G.PW;rectLine('slab',ox+M-0.1,M-0.1,ox+M+G.BW+0.1,M+G.BH+0.1,0);}
  // stair flights
  for(const R_ of G.ramps){const v=R_.axis==='v',ox=R_.x0,oy=R_.y0,lane=R_.r;
    const at_=(al,side)=>{const a=R_.r===0?al:4-al;return v?[ox+lane+side,oy+a]:[ox+a,oy+lane+side];};
    const hgt=al=>clamp((al-0.5)/3,0,1)*FH;
    for(const side of [0.04,0.96]){const p0=at_(0,side),p1=at_(0.5,side),p2=at_(3.5,side),p3=at_(4,side);
      L3('stair',p0[0],0,p0[1],p1[0],0,p1[1]);L3('stair',p1[0],0,p1[1],p2[0],FH,p2[1]);L3('stair',p2[0],FH,p2[1],p3[0],FH,p3[1]);}
    for(let i=0;i<12;i++){const a0=0.5+3*i/12,a1=0.5+3*(i+1)/12,y1=hgt(a1);
      const l0=at_(a0,0.04),r0=at_(a0,0.96),l1=at_(a1,0.04),r1=at_(a1,0.96);
      L3('stair',l0[0],y1,l0[1],r0[0],y1,r0[1]);L3('stair',l0[0],hgt(a0),l0[1],l0[0],y1,l0[1]);L3('stair',l1[0],y1,l1[1],l0[0],y1,l0[1]);}}
  // fatal funnel of the door the team is working
  if(tgt&&team.geo&&!team.geo.stair&&(PRE.includes(team.state)||(team.state==='entry'&&team.entryT<1.4))){
    const g=team.geo,Df=Math.min(g.D-0.1,3.4),sp=0.5+Df*0.45;
    const q=(lat,dep)=>[g.Px+g.nx*dep+g.tx*lat,g.Pz+g.nz*dep+g.tz*lat];
    const a1=q(-0.5,0),a2=q(0.5,0),b1=q(-Math.min(sp,g.Lm-0.05),Df),b2=q(Math.min(sp,g.Lp-0.05),Df);
    L3('funnel',a1[0],0.02,a1[1],b1[0],0.02,b1[1]);L3('funnel',a2[0],0.02,a2[1],b2[0],0.02,b2[1]);L3('funnel',b1[0],0.02,b1[1],b2[0],0.02,b2[1]);
  }
  for(const r of G.rooms){if(r.id<=1)continue;
    if(r.cleared)rectLine('cleared',r.x+0.14,r.y+0.14,r.x+r.w-0.14,r.y+r.h-0.14,0.01);
    else if(r===tgt)rectLine('target',r.x+0.14,r.y+0.14,r.x+r.w-0.14,r.y+r.h-0.14,0.01);}
  STY.target.a=0.35+0.3*(0.5+0.5*Math.sin(time*4));
  for(const f of G.furn)box3('furn',f.x+0.08,f.x+f.w-0.08,f.y+0.08,f.y+f.h-0.08,0,f.ht);
  const WT=0.07;
  for(const s of G.segs){const [x1,z1,x2,z2]=s,hz=z1===z2;
    wallBox(x1-(hz?WT:0),z1-(hz?0:WT),x2+(hz?WT:0),z2+(hz?0:WT),hz?0:WT,hz?WT:0,0,WALL_H);}
  for(const d of G.doors){if(d.stair)continue;const [x1,z1,x2,z2]=d.e,hz=z1===z2;
    wallBox(x1,z1,x2,z2,hz?0:WT,hz?WT:0,DOOR_H,WALL_H);
    if(d.arch)continue;
    const ls_=leafSeg(d),hx=ls_[0],hz2=ls_[1],lx=ls_[2]-hx,lz=ls_[3]-hz2;
    L3('door',hx,0.03,hz2,hx+lx,0.03,hz2+lz);L3('door',hx,DOOR_H-0.04,hz2,hx+lx,DOOR_H-0.04,hz2+lz);
    L3('door',hx,0.03,hz2,hx,DOOR_H-0.04,hz2);L3('door',hx+lx,0.03,hz2+lz,hx+lx,DOOR_H-0.04,hz2+lz);
    const kx=hx+lx*0.85,kz=hz2+lz*0.85;L3('door',kx,0.98,kz,kx,1.08,kz);
    if(d.locked&&d.o<0.1)L3('door',kx,1.18,kz,kx,1.3,kz);
    if(d.mark){const [mx,mz]=d.mark,[tx,tz]=d.markT,k=0.13;
      L3('mark',mx-tx*k,1.25-k,mz-tz*k,mx+tx*k,1.25+k,mz+tz*k);L3('mark',mx-tx*k,1.25+k,mz-tz*k,mx+tx*k,1.25-k,mz+tz*k);}}
  // danger areas: amber = someone has it, red dashed = nobody is watching it
  for(const d of team.frontier||[]){if(!d.m)continue;const k=d.covered?'cover':'threat',[x1,z1,x2,z2]=d.e,mx=d.m[0]*0.22,mz=d.m[1]*0.22,y0=d.stair?FH:0;
    L3(k,x1+mx,y0+0.03,z1+mz,x2+mx,y0+0.03,z2+mz);L3(k,x1+mx,y0+1.15,z1+mz,x2+mx,y0+1.15,z2+mz);
    L3(k,x1+mx,y0+0.03,z1+mz,x1+mx,y0+1.15,z1+mz);L3(k,x2+mx,y0+0.03,z2+mz,x2+mx,y0+1.15,z2+mz);}
  for(const o of team.ops){if(!o.cover||o.aim)continue;const m=muzzle(o),p=wpos(o.cover.P[0],o.cover.P[1]);L3w('coverLink',m[0],m[1],m[2],p[0],p[1]+1.2,p[2],tierOf(floorOf(o.x)));}
  // muzzle lines (close cameras): where each barrel actually points
  if(cam.fog<15)for(const o of team.ops){if(o===pov)continue;const m=muzzle(o),{ch,c,s}=chestW(o),q0=rifleAt(o.pose,0.2,0,o.hi,o.tuck||0,o.shoulder??1),q1=rifleAt(o.pose,RIFLE_LEN,0,o.hi,o.tuck||0,o.shoulder??1);
    const dx=c*(q1[0]-q0[0])-s*(q1[1]-q0[1]),dy=q1[2]-q0[2],dz=s*(q1[0]-q0[0])+c*(q1[1]-q0[1]),l=Math.hypot(dx,dy,dz)||1,L=1.6;
    let ex=m[0]+dx/l*L,ey=m[1]+dy/l*L,ez=m[2]+dz/l*L;const fy=floorOf(o.x)*FH;if(ey<fy){const t=(m[1]-fy)/(m[1]-ey);ex=m[0]+(ex-m[0])*t;ez=m[2]+(ez-m[2])*t;ey=fy;}
    L3w('muzzle',m[0],m[1],m[2],ex,ey,ez,tierOf(floorOf(o.x)));}
  // what the team has not looked at yet in the room they are clearing
  if(team.geo&&team.geo.seen&&WORKING.includes(team.state)&&!team.clearing){const S_=team.geo.seen,k=0.05;
    for(let i=0;i<S_.pts.length;i++)if(!S_.seen[i]){const p=S_.pts[i];L3('unseen',p[0]-k,0.02,p[1],p[0]+k,0.02,p[1]);L3('unseen',p[0],0.02,p[1]-k,p[0],0.02,p[1]+k);}}
  const fanMax=['entry','hold','pie'].includes(team.state)?7:4.5;
  for(const o of team.ops)fan(o,fanMax);
  for(const e of enemies)if(!e.alive){const k=0.22;L3('down',e.x-k,0.02,e.z-k,e.x+k,0.02,e.z+k);L3('down',e.x-k,0.02,e.z+k,e.x+k,0.02,e.z-k);}
  for(const n of nades){const [x,y,z]=n.p,k=0.07;L3('nade',x-k,y,z,x+k,y,z);L3('nade',x,y-k,z,x,y+k,z);L3('nade',x,y,z-k,x,y,z+k);}
  if(debug){ // planned paths and stack slots
    for(const a of [...team.ops,...enemies.filter(e=>e.alive)]){let px=a.x,pz=a.z;
      for(const w of a.wp){if(w.jump){px=w.jump[0];pz=w.jump[1];continue;}if(floorOf(px)===floorOf(w[0]))L3('dbgPath',px,0.05,pz,w[0],0.05,w[1]);px=w[0];pz=w[1];}}
    for(const s of team.slots||[]){const k=0.18;L3('dbgSlot',s[0]-k,0.04,s[1],s[0]+k,0.04,s[1]);L3('dbgSlot',s[0],0.04,s[1]-k,s[0],0.04,s[1]+k);}}
  flush();
  // stun flash: expanding rings + light wash
  ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
  for(const b of bangs){const u=b.t/0.6,r=0.3+u*3.2;ctx.strokeStyle='#ffffff';ctx.lineWidth=1.6;ctx.globalAlpha=(1-u)*0.9;
    for(const y of [0.3,1.1,1.9]){ctx.beginPath();let first=true;
      for(let i=0;i<=24;i++){const a=i/24*TAU,p=P3i(b.p[0]+Math.cos(a)*r,y,b.p[2]+Math.sin(a)*r);if(!p){first=true;continue;}
        if(first){ctx.moveTo(p[0],p[1]);first=false;}else ctx.lineTo(p[0],p[1]);}ctx.stroke();}
    const c=P3i(b.p[0],1,b.p[2]);if(c&&u<0.35){const gr=ctx.createRadialGradient(c[0],c[1],0,c[0],c[1],Math.max(60,900/c[2]));
      gr.addColorStop(0,`rgba(255,255,255,${0.55*(1-u/0.35)})`);gr.addColorStop(1,'rgba(255,255,255,0)');ctx.globalAlpha=1;ctx.fillStyle=gr;ctx.fillRect(0,0,VW,VH);}}
  for(const q of pulses){const c=P3(...q.p);if(!c)continue;const u=q.t/0.4,r=(0.05+u*0.14)*FOC/c[2];
    ctx.globalAlpha=(1-u)*0.9*TIER[tierOf(q.f)];ctx.strokeStyle=COL.team;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(c[0],c[1],r,0,TAU);ctx.stroke();}
  for(const t of tracers){const a=P3(...t.a),b=P3(...t.b);if(!a||!b)continue;const k=t.life/t.max;
    ctx.strokeStyle=t.col;ctx.globalAlpha=k;ctx.lineWidth=2.2;ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();
    ctx.globalAlpha=k*0.35;ctx.lineWidth=6;ctx.stroke();}
  for(const f of flashes){const p=P3(...f.p);if(!p)continue;const r=Math.max(4,120/p[2])*(f.life/0.07);
    ctx.globalAlpha=f.life/0.07;ctx.strokeStyle=f.col;ctx.lineWidth=1.5;ctx.beginPath();
    for(let i=0;i<4;i++){const a=i*Math.PI/4+0.3;ctx.moveTo(p[0]-Math.cos(a)*r,p[1]-Math.sin(a)*r);ctx.lineTo(p[0]+Math.cos(a)*r,p[1]+Math.sin(a)*r);}ctx.stroke();}
  ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;ctx.lineCap='butt';
  // labels (rooms on the floor in view)
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='500 10px "IBM Plex Mono", ui-monospace, monospace';
  for(const r of G.rooms){if(r.id<=1||r.f!==viewFloor)continue;const p=P3i(r.x+r.w/2,0.02,r.y+r.h/2);if(!p)continue;
    const tag=r.cleared?r.label+' · CLR':r===tgt?r.label+' · '+(team.state==='move'?'NEXT':'ENTRY'):r.label;
    ctx.globalAlpha=r.cleared?0.8:r===tgt?0.95:0.55;ctx.fillStyle=r.cleared?COL.clear:r===tgt?'#e6f2f8':'#6f8a9c';ctx.fillText(tag,p[0],p[1]);}
  ctx.globalAlpha=1;
  for(const o of team.ops){if(o===pov)continue;const hw=headW(o),p=P3(hw[0],hw[1]+0.3,hw[2]);if(!p)continue;
    const dim=floorOf(o.x)>viewFloor?0.3:1;
    ctx.globalAlpha=dim;ctx.font='600 11px "Chakra Petch", "Arial Narrow", sans-serif';ctx.fillStyle=COL.team;ctx.fillText(String(o.id),p[0],p[1]);
    if(cam.fog<15){ctx.font='500 9px "IBM Plex Mono", ui-monospace, monospace';ctx.globalAlpha=0.75*dim;
      ctx.fillText(o.blocked?'HOLD':o.low?'KNEEL':stanceName(o.pose,o.hi,o.tuck),p[0],p[1]+11);}
    ctx.globalAlpha=1;
    if(o.say){const k=o.sayT/SAY_T,a=k<0.1?k/0.1:k>0.75?(1-k)/0.25:1;
      ctx.globalAlpha=clamp(a,0,1)*dim;ctx.font='600 11px "Chakra Petch", "Arial Narrow", sans-serif';
      const y=p[1]-16-k*10,txt=o.say;const w=ctx.measureText(txt).width+10;
      ctx.fillStyle='rgba(7,11,16,.8)';ctx.fillRect(p[0]-w/2,y-8,w,16);
      ctx.fillStyle=/DOWN|CONTACT|FIRE/.test(txt)?'#ffd9d4':/CLEAR/.test(txt)?COL.clear:COL.team;ctx.fillText(txt,p[0],y+0.5);ctx.globalAlpha=1;}}
  if(debug)drawDebug();
  if(pov){
    const a=clamp((cam.blend-0.55)/0.3,0,1);ctx.globalAlpha=0.55*a;ctx.strokeStyle=COL.team;ctx.lineWidth=1;ctx.beginPath();
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ctx.moveTo(CX+dx*6,CY+dy*6);ctx.lineTo(CX+dx*16,CY+dy*16);}ctx.stroke();
    ctx.globalAlpha=0.7*a;ctx.font='500 10px "IBM Plex Mono", ui-monospace, monospace';ctx.fillStyle=COL.team;
    ctx.fillText('HELMET CAM · #1 · '+(pov.blocked?'HOLD FIRE':pov.low?'KNEEL':stanceName(pov.pose,pov.hi,pov.tuck)),CX,CY+34);
    if(pov.say){const k=pov.sayT/SAY_T;ctx.globalAlpha=a*clamp(k<0.1?k/0.1:k>0.75?(1-k)/0.25:1,0,1);
      ctx.font='600 15px "Chakra Petch", "Arial Narrow", sans-serif';ctx.fillText('1 · '+pov.say,CX,VH*0.74);}
    ctx.globalAlpha=1;
  }
  if(fade.a>0){ctx.globalAlpha=fade.a;ctx.fillStyle=COL.ground;ctx.fillRect(0,0,VW,VH);ctx.globalAlpha=1;}
}

/* D: state machine and per-operator readout for tuning */
function drawDebug(){
  const lines=[`STATE ${team.state} ${team.stateT.toFixed(1)}s  WATCHDOG ${team.wdCount||0}  FLOOR ${viewFloor+1}/${G.F}`,
    `TARGET ${team.room?team.room.label:'-'}  SEEN ${Math.round(seenFrac()*100)}%  ${team.geo?(team.geo.type||'')+(team.geo.pie?' pie':'')+(team.geo.stun?' stun':''):''}  DANGER ${team.frontier.filter(d=>d.covered).length}/${team.frontier.length}`];
  for(const o of team.ops)lines.push(`#${o.id} ${floorOf(o.x)+1}F wp${o.wp.length} d${Math.max(0,o.delay).toFixed(1)} v${Math.hypot(...o.vel).toFixed(1)} `+
    `${stanceName(o.pose,o.hi,o.tuck)} p${o.pose.toFixed(2)}${o.low?' KNEEL':''}${o.cover?' cover':''}${o.aim?' AIM→'+(o.blocked?'blocked':'hostile'):''}${o.flagT>0?' muzzle':''}`);
  const al=enemies.filter(e=>e.alive);
  lines.push(`HOSTILES ${al.length}  idle ${al.filter(e=>e.state==='idle').length}  moving ${al.filter(e=>e.state==='moving').length}  engaged ${al.filter(e=>e.eng).length}  stunned ${al.filter(e=>e.stunT>0).length}`);
  ctx.font='500 10px "IBM Plex Mono", ui-monospace, monospace';ctx.textAlign='left';ctx.textBaseline='top';
  const w=Math.min(VW-32,470),x=VW-16-w,y=Math.min(VH-16-lines.length*14-12,200);
  ctx.fillStyle='rgba(7,11,16,.85)';ctx.fillRect(x,y,w,lines.length*14+12);ctx.strokeStyle='#2b4456';ctx.strokeRect(x+0.5,y+0.5,w-1,lines.length*14+11);
  ctx.fillStyle='#8fd3ff';lines.forEach((l,i)=>ctx.fillText(l,x+8,y+6+i*14));
  ctx.textAlign='center';ctx.textBaseline='middle';
}
function drawMini(){
  const w=mm.clientWidth,h=mm.clientHeight;if(!w)return;mctx.clearRect(0,0,w,h);
  const fl=viewFloor,po=fl*G.PW;
  const x0=po+M-1,z0=M-1,ww=G.BW+2,hh=G.BH+2,sc=Math.min((w-8)/ww,(h-18)/hh),ox=(w-ww*sc)/2,oz=14+(h-14-hh*sc)/2;
  const X=x=>ox+(x-x0)*sc,Z=z=>oz+(z-z0)*sc,on=x=>floorOf(x)===fl;
  for(const r of G.rooms){if(r.id<=1||r.f!==fl)continue;
    if(r.cleared){mctx.fillStyle='rgba(79,211,138,.18)';mctx.fillRect(X(r.x),Z(r.y),r.w*sc,r.h*sc);}
    if(r===team.room&&team.state!=='secure'){mctx.strokeStyle='rgba(230,242,248,.7)';mctx.setLineDash([3,2]);mctx.strokeRect(X(r.x)+2,Z(r.y)+2,r.w*sc-4,r.h*sc-4);mctx.setLineDash([]);}}
  mctx.fillStyle='rgba(62,89,107,.8)';for(const f of G.furn)if(on(f.x))mctx.fillRect(X(f.x)+1,Z(f.y)+1,f.w*sc-2,f.h*sc-2);
  mctx.strokeStyle='#6f94aa';mctx.lineWidth=1;mctx.beginPath();
  for(const s of G.segs)if(on(Math.min(s[0],s[2])+1e-6)){mctx.moveTo(X(s[0]),Z(s[1]));mctx.lineTo(X(s[2]),Z(s[3]));}mctx.stroke();
  for(const R_ of G.ramps)if(on(R_.x0)){mctx.strokeStyle='rgba(124,159,179,.8)';const v=R_.axis==='v',lx=v?R_.x0+R_.r:R_.x0,ly=v?R_.y0:R_.y0+R_.r;
    for(let k=0;k<=8;k++){if(v){mctx.beginPath();mctx.moveTo(X(lx),Z(ly+k*0.5));mctx.lineTo(X(lx+1),Z(ly+k*0.5));mctx.stroke();}
      else{mctx.beginPath();mctx.moveTo(X(lx+k*0.5),Z(ly));mctx.lineTo(X(lx+k*0.5),Z(ly+1));mctx.stroke();}}}
  mctx.lineWidth=2;
  for(const d of team.frontier||[]){if(!on(d.e[0]+1e-6))continue;mctx.strokeStyle=d.covered?COL.team:COL.hostile;mctx.beginPath();
    mctx.moveTo(X(d.e[0]),Z(d.e[1]));mctx.lineTo(X(d.e[2]),Z(d.e[3]));mctx.stroke();}
  mctx.lineWidth=1;
  for(const e of enemies){if(!on(e.x))continue;const x=X(e.x),z=Z(e.z);
    if(e.alive){mctx.fillStyle=COL.hostile;mctx.beginPath();mctx.arc(x,z,2.2,0,TAU);mctx.fill();}
    else{mctx.strokeStyle='#8e4038';mctx.beginPath();mctx.moveTo(x-2,z-2);mctx.lineTo(x+2,z+2);mctx.moveTo(x+2,z-2);mctx.lineTo(x-2,z+2);mctx.stroke();}}
  for(const o of team.ops){if(!on(o.x))continue;const x=X(o.x),z=Z(o.z);mctx.fillStyle=COL.team;mctx.beginPath();mctx.arc(x,z,2.4,0,TAU);mctx.fill();
    mctx.strokeStyle=COL.team;mctx.beginPath();mctx.moveTo(x,z);mctx.lineTo(x+Math.cos(o.h)*6,z+Math.sin(o.h)*6);mctx.stroke();}
  mctx.font='500 9px "IBM Plex Mono", monospace';mctx.fillStyle='#8fa9b8';mctx.textBaseline='top';
  mctx.fillText(`FLOOR ${fl+1} / ${G.F}`,6,4);
}

/* ---------- HUD ---------- */
let logDirty=true,hudT=0;
const hPhase=$('hPhase'),hRooms=$('hRooms'),hHost=$('hHost'),hTime=$('hTime'),hDanger=$('hDanger'),logEl=$('log');
function phaseText(){
  const g=team.geo;
  if(paused)return 'PAUSED';
  switch(team.state){
    case 'move':return g?(g.stair?`MOVING · STAIRWELL → ${g.room.label}`:`MOVING · ${g.room.label} ${team.door&&team.door.arch?'OPENING':g.wall+' DOOR'}`):'MOVING';
    case 'stacked':return g.stair?`STACKED · STAIRWELL`:`STACKED · ${g.room.label} · ${g.type==='tee'?'2x2':g.fed}`;
    case 'entry':return `${g.stair?'CLIMBING':'ENTRY'} · ${g.room.label} · ${g.entryText}`;
    case 'hold':return team.clearing?`${g.room.label} CLEAR`:`DOMINATING ${g.room.label}`;
    case 'breach':return `BREACH · ${g.room.label} · ${g.breachStage==='kick'?'MECHANICAL':'BALLISTIC'}`;
    case 'pie':return `SLICING THE PIE · ${g.room.label}`;
    case 'peek':return `QUICK PEEK · ${g.room.label}`;
    case 'stun':return `FLASHBANG · ${g.room.label}`;
    case 'secure':return 'BUILDING SECURE';
    default:return 'PLANNING';
  }
}
function hud(dt){
  hudT-=dt;
  if(hudT<=0){hudT=0.2;
    const c=G.rooms.filter(r=>r.id>1&&r.cleared).length;
    hRooms.textContent=pad(c)+' / '+pad(roomsTotal)+(G.F>1?` · ${curFloor()+1}F`:'');
    hHost.textContent=(S.hostiles?'ON':'OFF')+(kills?` · ${kills} DOWN`:'')+(S.hostiles&&compromised&&team.state!=='secure'?' · ALERT':'');
    const Fd=team.frontier||[];hDanger.textContent=Fd.length?`${Fd.filter(d=>d.covered).length} / ${Fd.length} COVERED`:'—';
    hTime.textContent=fmtT(simT);hPhase.textContent=phaseText();
    const JP={orbit:'ORBIT',follow:'FOLLOW',chase:'CHASE',helmet:'HELMET',plan:'PLAN'};
    bCam.querySelector('b').textContent=S.cam==='auto'?'AUTO · '+(JP[cam.mode]||''):JP[S.cam];}
  if(logDirty){logDirty=false;logEl.replaceChildren(...logs.map(l=>{const li=document.createElement('li');if(l.cls)li.className=l.cls;
    const t=document.createElement('time');t.textContent=l.t;const b=document.createElement('b');b.textContent=l.who;const s=document.createElement('span');s.textContent=l.text;
    li.append(t,b,s);return li;}));}
}

/* ---------- lifecycle ---------- */
const fade={a:1,dir:-1};
function resetWorld(){
  genMap();
  enemies=[];tracers=[];flashes=[];shards=[];nades=[];bangs=[];pulses=[];kills=0;simT=0;compromised=false;team.lastRoom=null;team.stuckPlans=0;team.shiftT=0;
  team.frontier=[];team.door=null;team.coverT=0;team.engT=0;team.fireLogT=0;team.contact=null;team.shiftFor=null;
  roomsTotal=G.rooms.length-2;
  team.state='plan';team.stateT=0;team.events=[];team.room=null;team.geo=null;team.t=0;team.clearing=false;
  spawnTeam();if(S.hostiles)spawnEnemies();
  const zone=pick(['54S UE','38S MB','18T WL','33U UP','11S LT','35T PF']);
  structName=pad(ri(1,99))+'-'+pick('ABCDEFGH'.split(''));
  $('hStruct').textContent=`STRUCTURE ${structName} · ${G.F}F · ${S.team}-MAN · ${zone} ${pad(ri(0,99999),5)} ${pad(ri(0,99999),5)}`;
  $('banner').classList.remove('on');
  if(logs.length)comms('—','NEW STRUCTURE','sys');
  comms(S.team>1?'TL':'1',`INSERTION · ${TEAM_WORD[S.team]} · STRUCTURE ${structName} · ${G.F} FLOOR${G.F>1?'S':''} · ${roomsTotal} ROOMS`,'sys');
  cam.autoT=0;updateCam(0,true);
}
function newMap(){fade.dir=1;}

let last=performance.now();
function frame(now){
  const rdt=Math.min(0.05,(now-last)/1000);last=now;
  if(fade.dir){fade.a=clamp(fade.a+fade.dir*rdt*1.6,0,1);
    if(fade.dir>0&&fade.a>=1){resetWorld();fade.dir=-1;}else if(fade.dir<0&&fade.a<=0)fade.dir=0;}
  if(!paused){let sdt=rdt*S.speed;while(sdt>1e-5){const st=Math.min(sdt,0.02);step(st);sdt-=st;}}
  updateCam(rdt,false);
  render(now/1000);drawMini();hud(rdt);
  requestAnimationFrame(frame);
}

/* ---------- controls ---------- */
const bHost=$('bHost'),bCam=$('bCam'),bSpeed=$('bSpeed'),bPause=$('bPause'),bTeam=$('bTeam');
function syncButtons(){
  bHost.setAttribute('aria-pressed',String(S.hostiles));bHost.querySelector('b').textContent=S.hostiles?'ON':'OFF';
  bSpeed.querySelector('b').textContent=S.speed+'×';
  bTeam.querySelector('b').textContent=S.team;
  bPause.setAttribute('aria-pressed',String(paused));bPause.textContent=paused?'Resume':'Pause';
}
function toggleHostiles(){S.hostiles=!S.hostiles;save();
  if(S.hostiles){spawnEnemies();comms('SIM','HOSTILES ON','sys');}else{removeLiveEnemies();comms('SIM','HOSTILES OFF','sys');}
  syncButtons();hudT=0;}
function cycleCam(){S.cam=CAM_MODES[(CAM_MODES.indexOf(S.cam)+1)%CAM_MODES.length];save();hudT=0;}
function setCam(m){S.cam=m;save();hudT=0;}
function cycleTeam(){S.team=S.team===1?4:S.team-1;save();syncButtons();if(!fade.dir)newMap();}
function cycleSpeed(){const s=[1,2,4];S.speed=s[(s.indexOf(S.speed)+1)%s.length];save();syncButtons();}
function togglePause(){paused=!paused;syncButtons();hudT=0;}
function fullscreen(){const d=document;if(d.fullscreenElement){d.exitFullscreen&&d.exitFullscreen().catch(()=>{});}
  else{const el=d.documentElement;el.requestFullscreen&&el.requestFullscreen().catch(()=>{});}}
bHost.onclick=toggleHostiles;bTeam.onclick=cycleTeam;bCam.onclick=cycleCam;bSpeed.onclick=cycleSpeed;bPause.onclick=togglePause;
$('bNew').onclick=()=>{if(!fade.dir)newMap();};$('bFull').onclick=fullscreen;

let idleTimer=0;
function wake(){document.body.classList.remove('idle');clearTimeout(idleTimer);idleTimer=setTimeout(()=>document.body.classList.add('idle'),3200);}
['pointermove','pointerdown','keydown','touchstart'].forEach(ev=>addEventListener(ev,wake,{passive:true}));
let wl=null;
addEventListener('pointerdown',()=>{if(!wl&&navigator.wakeLock){navigator.wakeLock.request('screen').then(l=>{wl=l;l.addEventListener('release',()=>{wl=null;});}).catch(()=>{});}});
addEventListener('keydown',e=>{
  if(e.metaKey||e.ctrlKey||e.altKey)return;
  const k=e.key.toLowerCase();
  if(k==='h')toggleHostiles();else if(k==='c')cycleCam();else if(k==='s')cycleSpeed();
  else if(k==='p'||k===' '){if(k===' ')e.preventDefault();togglePause();}
  else if(k==='n'){if(!fade.dir)newMap();}
  else if(k==='i')document.body.classList.toggle('nohud');
  else if(k==='f')fullscreen();
  else if(k==='d')debug=!debug;
  else if(k==='t')cycleTeam();
  else if(k>='1'&&k<='6')setCam(CAM_MODES[+k-1]);
});
addEventListener('resize',resize);

resize();resetWorld();syncButtons();wake();
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>{hudT=0;});
if(globalThis.__KH_EXPORT)globalThis.__KH_EXPORT({step,team,G:()=>G,enemies:()=>enemies,reset:resetWorld,S,tileIdx,ridAt,floorOf,los,stairH,chestW,rifleAt,poseAt,wpos,leafSeg,muzzleClear,muzzlePt,flagAt,seenFrac,simT:()=>simT}); // headless test harness
else requestAnimationFrame(t=>{last=t;frame(t);});
})();
</script>

// CI gate: a few deterministic maps per team size; fails the build if the simulation regresses.
// usage: node tools/check.js [dist/index.html]
const {spawnSync}=require('child_process');
const page=process.argv[2]||'dist/index.html';
const runs=[[1,3],[2,3],[4,4]]; // [team size, maps]
let bad=[];
for(const [team,maps] of runs){
  const r=spawnSync(process.execPath,[__dirname+'/verify.js',page,String(maps),'1200',String(team)],{env:{...process.env,SEED:String(100+team)},encoding:'utf8',timeout:600000});
  if(r.status!==0){bad.push(`team ${team}: verify exited ${r.status}\n${r.stderr}`);continue;}
  const d=JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
  const [shotsPast]=d.R14_shotsPastTeammate.split('/').map(Number);
  const checks={
    'every map secured':d.secure===maps,'no premature secure':d.premature===0,'no timeouts':d.timeout===0,'no errors':d.err===0,
    'nobody walks through a closed door':d.R18_closedDoorCrossings.ops===0&&d.R18_closedDoorCrossings.enemies===0,
    'no shots past a teammate':shotsPast===0,'no hostile fires through a wall':d.R34_enemyShots.muzzleBlocked===0&&d.R34_enemyShots.noLOS===0,
    'no door opens by itself':d.R35_doorOpens.unattended===0,'never straight from high ready to SUL':d.R28_directHighSul===0,
  };
  const failed=Object.entries(checks).filter(([,ok])=>!ok).map(([k])=>k);
  console.log(`team ${team}: ${maps} maps, ${failed.length?'FAILED: '+failed.join(', '):'ok'} (${d.runtime_s}s)`);
  if(failed.length)bad.push(`team ${team}: ${failed.join(', ')}`);
}
if(bad.length){console.error(bad.join('\n'));process.exit(1);}

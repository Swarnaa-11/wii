"use strict";
/* Game registry. Each game: meta + init(P,env) + update(dt,now,left,P,env) + draw(g,W,H,P,left,env) + over(P).
   Players (P) are shared host-side objects: p.in {s,y} normalised tilt, p.fire (latched), p.score. MotRacer's loop lives in index.html. */
const GH={
  sx:(p,k)=>p.id==="kb"?((k.ArrowRight||k.d?1:0)-(k.ArrowLeft||k.a?1:0)):p.in.s,
  board(g,P){g.textAlign="left";g.font="700 26px Fredoka,sans-serif";[...P].sort((a,b)=>b.score-a.score).forEach((p,i)=>{g.fillStyle=p.c;g.fillText(`${i+1}. ${p.name}${p.online?"":" (offline)"}  ${p.score}`,20,40+i*30)})}
};
const GAMES={
racer:{name:"Motion Racer",icon:"🏎️",c:"#ff5d5d",desc:"Dodge cones, grab coins.",help:"Tilt to steer. Keyboard: ← →",dur:45},

target:{name:"Motion Target",icon:"🎯",c:"#2ec4b6",desc:"Aim with your phone. First hit takes the target.",help:"Tilt to aim, shake or tap FIRE. Keyboard: mouse + click",dur:40,
 init(P,env){this.t=[];P.forEach(p=>{p.cx=env.W/2;p.cy=env.H/2;p.fire=0})},
 update(dt,now,left,P,env){const{W,H}=env;
  while(this.t.length<6){const k=Math.random(),b=k<.45?0:k<.8?1:2,r=[58,36,22][b];
   this.t.push({x:r+Math.random()*(W-2*r),y:100+r+Math.random()*(H-200-2*r),r,pts:[10,25,50][b],vx:(Math.random()-.5)*[90,180,320][b],vy:(Math.random()-.5)*[60,120,220][b],age:0})}
  this.t.forEach(o=>{o.x+=o.vx*dt;o.y+=o.vy*dt;o.age+=dt;if(o.x<o.r||o.x>W-o.r)o.vx*=-1;if(o.y<100+o.r||o.y>H-o.r)o.vy*=-1});
  this.t=this.t.filter(o=>o.age<7);
  P.forEach(p=>{if(p.id==="kb"){p.cx=env.mouse.x;p.cy=env.mouse.y}
   else{p.cx+=((p.in.s+1)/2*W-p.cx)*Math.min(1,dt*14);p.cy+=((p.in.y+1)/2*H-p.cy)*Math.min(1,dt*14)}
   if(p.fire){p.fire=0;p.fl=.15;const i=this.t.findIndex(o=>Math.hypot(o.x-p.cx,o.y-p.cy)<=o.r);
    if(i>=0){p.score+=this.t[i].pts;this.t.splice(i,1);Sfx.play("hit")}}p.fl=Math.max(0,(p.fl||0)-dt)})},
 draw(g,W,H,P){g.fillStyle="#12303a";g.fillRect(0,0,W,H);
  this.t.forEach(o=>{[1,.66,.33].forEach((k,i)=>{g.fillStyle=i%2?"#fff":"#ff5d5d";g.beginPath();g.arc(o.x,o.y,o.r*k,0,7);g.fill()});
   g.fillStyle="#12303a";g.font="700 16px Fredoka,sans-serif";g.textAlign="center";g.fillText(o.pts,o.x,o.y+5)});
  P.forEach(p=>{g.strokeStyle=p.c;g.lineWidth=p.fl?6:3;const r=p.fl?30:20;g.beginPath();g.arc(p.cx,p.cy,r,0,7);g.moveTo(p.cx-r-10,p.cy);g.lineTo(p.cx+r+10,p.cy);g.moveTo(p.cx,p.cy-r-10);g.lineTo(p.cx,p.cy+r+10);g.stroke()});
  GH.board(g,P)},
 over(){return false}},

balance:{name:"Balance Challenge",icon:"⚖️",c:"#ffd23f",desc:"Keep the ball on the beam. Last one standing wins.",help:"Tilt left/right to steer the ball. Keyboard: ← →",dur:180,
 init(P){this.el=0;this.w=0;this.n=1;this.out=0;P.forEach(p=>{p.bx=0;p.bv=0;p.alive=true;p.score=0})},
 edge(){return Math.max(.45,1-this.el/120)},
 update(dt,now,left,P,env){this.el+=dt;const d=1+this.el/20;this.n-=dt;
  if(this.n<=0){this.w=(Math.random()<.5?-1:1)*(.5+.15*d);this.n=(1.5+Math.random()*2)/Math.sqrt(d)}this.w*=Math.pow(.4,dt);
  P.forEach(p=>{if(!p.alive)return;const s=GH.sx(p,env.keys);
   p.bv+=(s*2.5+this.w*2+p.bx*.8+Math.sin(this.el*.7+p.n)*.15*d)*dt;p.bv*=Math.pow(.05,dt);p.bx+=p.bv*dt;p.score=Math.round(this.el*10);
   if(Math.abs(p.bx)>this.edge()){p.alive=false;Sfx.play("out")}})},
 draw(g,W,H,P){g.fillStyle="#2b2410";g.fillRect(0,0,W,H);const w=W/P.length;
  P.forEach((p,i)=>{const cx=i*w+w/2,hw=w*.4,e=this.edge();g.fillStyle="#6b5a1d";g.fillRect(cx-hw*e,H*.7,hw*2*e,14);
   g.fillStyle=p.alive?p.c:"#555";g.beginPath();g.arc(cx+p.bx*hw,H*.7-20,20,0,7);g.fill();
   g.textAlign="center";g.font="700 28px Fredoka,sans-serif";g.fillStyle=p.c;g.fillText(`P${p.n} ${p.name}`,cx,H*.3);
   g.fillStyle="#fff";g.fillText(p.alive?(p.score/10).toFixed(1)+"s":"OUT "+(p.score/10).toFixed(1)+"s",cx,H*.3+40)});
  g.fillStyle="#fff";g.font="700 40px Fredoka,sans-serif";g.textAlign="center";g.fillText(this.w>.2?"💨 →":this.w<-.2?"← 💨":"",W/2,90)},
 over(P){return P.filter(p=>p.alive).length<=(P.length>1?1:0)}},

reaction:{name:"Reaction Challenge",icon:"⚡",c:"#9b7bff",desc:"Wait for green, then shake. Jump early and lose points.",help:"Shake the phone (or tap FIRE) on green. Keyboard: Space or click",dur:9999,
 hud(){return`Round ${Math.min(this.round+1,5)}/5`},
 nr(P){this.t=1.5+Math.random()*2.5;this.st="wait";this.first=1;P.forEach(p=>{p.rtv=null;p.fs=0;p.fire=0;p.rep=0;p.msg=""})},
 init(P){this.round=0;this.done=0;this.nr(P)},
 update(dt,now,left,P,env){
  if(this.st==="wait"){this.t-=dt;P.forEach(p=>{if(p.fire){p.fire=0;if(!p.fs){p.fs=1;p.score-=300;p.msg="False start −300";Sfx.play("out")}}});
   if(this.t<=0){this.st="go";this.goAt=now;P.forEach(p=>p.fire=0);env.send("go",{r:this.round});Sfx.play("count")}}
  else if(this.st==="go"){const h=now-this.goAt;
   P.forEach(p=>{if(p.fire&&!p.fs&&p.rtv==null){const rt=Math.max(100,Math.round(p.rep?Math.min(p.rep,h):h));p.rtv=rt;let s=Math.max(0,1000-rt);if(this.first){s+=200;this.first=0}p.score+=s;p.msg=rt+" ms";Sfx.play("point")}p.fire=0});
   if(P.every(p=>p.fs||p.rtv!=null)||h>2500){P.forEach(p=>{if(!p.fs&&p.rtv==null)p.msg="No response"});this.st="show";this.t=2.2}}
  else{this.t-=dt;if(this.t<=0){this.round++;if(this.round>=5)this.done=1;else this.nr(P)}}},
 draw(g,W,H,P){g.fillStyle=this.st==="wait"?"#b3261e":this.st==="go"?"#1fa855":"#241c3f";g.fillRect(0,0,W,H);
  g.textAlign="center";g.fillStyle="#fff";g.font="700 min(12vw,120px) Fredoka,sans-serif";g.font=`700 ${Math.min(W*.12,120)}px Fredoka,sans-serif`;
  if(this.st!=="show")g.fillText(this.st==="wait"?"WAIT…":"SHAKE!",W/2,H*.5);
  else{g.font="700 34px Fredoka,sans-serif";P.forEach((p,i)=>{g.fillStyle=p.c;g.fillText(`${p.name}: ${p.msg}`,W/2,H*.35+i*50)})}
  GH.board(g,P)},
 over(){return this.done}}
};

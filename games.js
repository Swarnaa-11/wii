"use strict";

/*
  MOTIONPLAY GAME REGISTRY

  CONTROLLER INPUT
  p.pad.x / p.pad.y     Left stick   (-1 to 1)
  p.pad.rx / p.pad.ry   Right stick  (-1 to 1)
  p.pad.buttons         Array of: A B X Y L1 L2 R1 R2 START SELECT
  p.in.s / p.in.y       Phone tilt

  KEYBOARD (single player)
  Arrows / WASD = left stick     IJKL = right stick
  Space=A  Shift=B  E=X  Q=Y  R=R1  Z=L1  X=L2  C=R2  Enter=START
  Mouse = aiming

  Game interface:
  meta + init(P,env) + update(dt,now,left,P,env) + draw(g,W,H,P,left,env) + over(P)
  Optional: hud() returns the text for the top HUD.
*/

/* =========================================================
   SHARED HELPERS
========================================================= */

const GH = {
  sx(p,k={}) {
    if(p.id === "kb") return (k.ArrowRight||k.d?1:0)-(k.ArrowLeft||k.a?1:0);
    const stick = Number(p.pad?.x) || 0;
    return Math.abs(stick) > .12 ? stick : (p.in?.s || 0);
  },
  sy(p,k={}) {
    if(p.id === "kb") return (k.ArrowDown||k.s?1:0)-(k.ArrowUp||k.w?1:0);
    const stick = Number(p.pad?.y) || 0;
    return Math.abs(stick) > .12 ? stick : (p.in?.y || 0);
  },
  rx(p) { return Number(p.pad?.rx) || 0; },
  ry(p) { return Number(p.pad?.ry) || 0; },
  buttons(p) { return p.pad?.buttons || []; },
  pressed(p,name) { return GH.buttons(p).includes(name); },

  /* Call once per frame per player. Gives p.held and p.just (Sets of button names). */
  poll(p) {
    const cur = new Set(GH.buttons(p));
    const prev = p._held || new Set();
    p.just = new Set([...cur].filter(b => !prev.has(b)));
    p.held = cur;
    p._held = cur;
  },

  board(g,P) {
    g.save();
    g.textAlign = "left"; g.textBaseline = "middle";
    g.font = "700 21px Fredoka,sans-serif";
    [...P].sort((a,b)=>b.score-a.score).forEach((p,i)=>{
      const y = 30+i*29;
      g.fillStyle = "rgba(0,0,0,.35)";
      g.fillRect(12,y-12,Math.min(260,g.canvas.width*.34),24);
      g.fillStyle = p.c;
      g.fillText(`${i+1}. ${p.name}${p.online?"":" (offline)"}  ${p.score}`,20,y);
    });
    g.restore();
  },
  text(g,text,x,y,size=28,color="#fff",align="center") {
    g.save();
    g.fillStyle = color;
    g.font = `700 ${size}px Fredoka,sans-serif`;
    g.textAlign = align; g.textBaseline = "middle";
    g.fillText(String(text),x,y);
    g.restore();
  },
  rect(g,x,y,w,h,c){ g.fillStyle=c; g.fillRect(x,y,w,h); },
  roundRect(g,x,y,w,h,r,c){ g.fillStyle=c; g.beginPath(); g.roundRect(x,y,w,h,r); g.fill(); },
  circle(g,x,y,r,c){ g.fillStyle=c; g.beginPath(); g.arc(x,y,r,0,Math.PI*2); g.fill(); },
  line(g,x1,y1,x2,y2,c,w=2){ g.strokeStyle=c; g.lineWidth=w; g.beginPath(); g.moveTo(x1,y1); g.lineTo(x2,y2); g.stroke(); },
  clamp(v,a,b){ return Math.max(a,Math.min(b,v)); },
  random(a,b){ return a+Math.random()*(b-a); },
  gradient(g,x,y,w,h,stops){
    const gr = g.createLinearGradient(x,y,x,y+h);
    stops.forEach((s,i)=>gr.addColorStop(i/(stops.length-1),s));
    return gr;
  },
  particle(list,x,y,color,count=8,speed=180) {
    for(let i=0;i<count;i++){
      const a = Math.random()*Math.PI*2, v = GH.random(speed*.3,speed);
      list.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:GH.random(.25,.65),max:.65,color,size:GH.random(3,7)});
    }
  },
  updateParticles(list,dt) {
    list.forEach(p=>{ p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=280*dt; p.life-=dt; });
    return list.filter(p=>p.life>0);
  },
  drawParticles(g,list) {
    list.forEach(p=>{ g.globalAlpha=Math.max(0,p.life/p.max); GH.circle(g,p.x,p.y,p.size,p.color); });
    g.globalAlpha = 1;
  },
  drawCloud(g,x,y,s=1) {
    g.save(); g.fillStyle="rgba(255,255,255,.9)"; g.beginPath();
    g.arc(x,y,19*s,0,Math.PI*2); g.arc(x+23*s,y-10*s,24*s,0,Math.PI*2); g.arc(x+48*s,y,18*s,0,Math.PI*2);
    g.fill(); g.restore();
  },
  drawStar(g,x,y,r,color="#fff") {
    g.save(); g.translate(x,y); g.fillStyle=color; g.beginPath();
    for(let i=0;i<10;i++){
      const a=-Math.PI/2+i*Math.PI/5, rr=i%2===0?r:r*.43;
      const px=Math.cos(a)*rr, py=Math.sin(a)*rr;
      i===0?g.moveTo(px,py):g.lineTo(px,py);
    }
    g.closePath(); g.fill(); g.restore();
  },
  glow(g,x,y,r,color,alpha=1) {
    g.save(); g.globalCompositeOperation="lighter"; g.globalAlpha=alpha;
    const gr=g.createRadialGradient(x,y,0,x,y,r);
    gr.addColorStop(0,color); gr.addColorStop(1,"rgba(0,0,0,0)");
    g.fillStyle=gr; g.beginPath(); g.arc(x,y,r,0,Math.PI*2); g.fill(); g.restore();
  },
  hash(n){ const s=Math.sin(n*127.1+311.7)*43758.5453; return s-Math.floor(s); },
  bigText(g,text,x,y,size,c1="#fff",c2="#ffb703",scale=1,alpha=1) {
    g.save();
    g.translate(x,y); g.scale(scale,scale); g.globalAlpha=alpha;
    g.font=`700 ${size}px Fredoka,sans-serif`; g.textAlign="center"; g.textBaseline="middle";
    g.lineJoin="round"; g.lineWidth=size*.16; g.strokeStyle="#12081f"; g.strokeText(text,0,size*.04);
    const gr=g.createLinearGradient(0,-size/2,0,size/2); gr.addColorStop(0,c1); gr.addColorStop(1,c2);
    g.fillStyle=gr; g.fillText(text,0,0);
    g.restore();
  }
};

function drawFruit(g,o) {
  const {x,y,r,type,angle=0} = o;
  g.save(); g.translate(x,y); g.rotate(angle);
  if(type==="apple") {
    g.fillStyle="#e93643"; g.beginPath(); g.moveTo(0,-r*.65);
    g.bezierCurveTo(-r*1.1,-r*1.3,-r*1.35,-r*.2,-r*.9,r*.65);
    g.bezierCurveTo(-r*.4,r*1.2,r*.2,r*1.2,r*.9,r*.65);
    g.bezierCurveTo(r*1.35,-r*.2,r*1.1,-r*1.3,0,-r*.65); g.fill();
    GH.circle(g,-r*.35,-r*.2,r*.25,"rgba(255,255,255,.2)");
    GH.line(g,0,-r*.6,3,-r*1.1,"#65432a",4);
    g.fillStyle="#4bba55"; g.beginPath(); g.ellipse(9,-r*.95,9,4,-.4,0,Math.PI*2); g.fill();
  } else if(type==="strawberry") {
    g.fillStyle="#ed344e"; g.beginPath(); g.moveTo(0,-r*.9);
    g.bezierCurveTo(r*1.2,-r*.9,r*1.2,r*.1,0,r*1.15);
    g.bezierCurveTo(-r*1.2,r*.1,-r*1.2,-r*.9,0,-r*.9); g.fill();
    for(let i=0;i<7;i++) GH.circle(g,Math.sin(i*2.4)*r*.55,-r*.45+i*r*.22,1.8,"#ffe59a");
    GH.line(g,-r*.4,-r*.8,0,-r*1.15,"#44a84d",4); GH.line(g,0,-r*1.15,r*.4,-r*.8,"#44a84d",4);
  } else if(type==="orange") {
    GH.circle(g,0,0,r*.85,"#ff982e"); GH.circle(g,-r*.2,-r*.2,r*.5,"rgba(255,220,140,.18)");
    GH.circle(g,0,-r*.85,4,"#548f3b"); GH.line(g,0,-r*.8,5,-r*1.1,"#548f3b",3);
  } else if(type==="watermelon") {
    GH.circle(g,0,0,r,"#258e55"); g.beginPath(); g.arc(0,0,r*.78,0,Math.PI*2); g.fillStyle="#f34e60"; g.fill();
    g.strokeStyle="#b8e66a"; g.lineWidth=4; g.beginPath(); g.arc(0,0,r*.88,0,Math.PI*2); g.stroke();
    for(let i=0;i<5;i++) GH.circle(g,Math.sin(i*1.3)*r*.35,Math.cos(i*1.3)*r*.35,2.3,"#3b2633");
  } else if(type==="banana") {
    g.strokeStyle="#f7d34b"; g.lineWidth=r*.65; g.lineCap="round"; g.beginPath();
    g.arc(0,-r*.15,r*.75,.2,Math.PI-.2); g.stroke();
    GH.circle(g,-r*.7,r*.25,3,"#74502c"); GH.circle(g,r*.7,r*.25,3,"#74502c");
  } else if(type==="bomb") {
    GH.circle(g,0,0,r*.9,"#272b34"); GH.circle(g,-r*.25,-r*.25,r*.3,"#555d69");
    GH.line(g,0,-r*.8,8,-r*1.3,"#d6a36a",5); GH.drawStar(g,10,-r*1.3,7,"#ffdb55");
    GH.text(g,"!",0,3,r*.9,"#fff");
  }
  g.restore();
}

/* =========================================================
   SIMPLE GAMES (target, reaction, fruit)
========================================================= */

const SMALL = {

target: {
  name:"Motion Target", icon:"🎯", c:"#2ec4b6",
  desc:"Aim and hit moving targets.",
  help:"Right stick or mouse to aim. Press A or X to shoot.",
  dur:40,
  init(P,env){ this.t=[]; this.particles=[]; P.forEach(p=>{ p.cx=env.W/2; p.cy=env.H/2; p.fire=0; }); },
  update(dt,now,left,P,env){
    const {W,H}=env;
    while(this.t.length<7){
      const k=Math.random(), b=k<.45?0:k<.8?1:2, r=[58,38,24][b];
      this.t.push({x:GH.random(r,W-r),y:GH.random(120,H-r),r,pts:[10,25,50][b],
        vx:GH.random(-1,1)*[90,180,320][b],vy:GH.random(-1,1)*[60,120,220][b],age:0,phase:Math.random()*6});
    }
    this.t.forEach(o=>{
      o.x+=o.vx*dt; o.y+=o.vy*dt; o.age+=dt; o.phase+=dt;
      if(o.x<o.r||o.x>W-o.r)o.vx*=-1;
      if(o.y<100+o.r||o.y>H-o.r)o.vy*=-1;
    });
    this.t=this.t.filter(o=>o.age<9);
    P.forEach(p=>{
      if(p.id==="kb"){ p.cx=env.mouse.x; p.cy=env.mouse.y; }
      else {
        p.cx=GH.clamp(p.cx+GH.rx(p)*W*dt*1.8,0,W);
        p.cy=GH.clamp(p.cy+GH.ry(p)*H*dt*1.8,0,H);
      }
      const shoot=p.fire||GH.pressed(p,"A")||GH.pressed(p,"X");
      if(shoot){
        p.fire=0; p.fl=.15;
        const i=this.t.findIndex(o=>Math.hypot(o.x-p.cx,o.y-p.cy)<=o.r);
        if(i>=0){
          p.score+=this.t[i].pts;
          GH.particle(this.particles,this.t[i].x,this.t[i].y,"#ffe36b",10);
          this.t.splice(i,1); Sfx.play("hit");
        } else Sfx.play("out");
      }
      p.fl=Math.max(0,(p.fl||0)-dt);
    });
    this.particles=GH.updateParticles(this.particles,dt);
  },
  draw(g,W,H,P){
    GH.rect(g,0,0,W,H,"#102f3b");
    for(let i=0;i<25;i++)GH.circle(g,(i*137)%W,(i*89)%H,2,"#285366");
    this.t.forEach(o=>{
      const pulse=1+Math.sin(o.phase*5)*.07;
      GH.circle(g,o.x,o.y,o.r*pulse,"#f45b62");
      GH.circle(g,o.x,o.y,o.r*.7*pulse,"#fff");
      GH.circle(g,o.x,o.y,o.r*.4*pulse,"#f45b62");
      GH.text(g,o.pts,o.x,o.y+5,16,"#fff");
    });
    GH.drawParticles(g,this.particles);
    P.forEach(p=>{
      g.strokeStyle=p.c; g.lineWidth=p.fl?6:3;
      const r=p.fl?30:20;
      g.beginPath(); g.arc(p.cx,p.cy,r,0,Math.PI*2);
      g.moveTo(p.cx-r-10,p.cy); g.lineTo(p.cx+r+10,p.cy);
      g.moveTo(p.cx,p.cy-r-10); g.lineTo(p.cx,p.cy+r+10); g.stroke();
    });
    GH.board(g,P);
  },
  over(){ return false; }
},

reaction: {
  name:"Reaction Challenge", icon:"⚡", c:"#9b7bff",
  desc:"Wait for green, then react as fast as possible.",
  help:"Press A or X when the screen turns green. Do not press early.",
  dur:9999,
  hud(){ return `Round ${Math.min(this.round+1,5)}/5`; },
  nr(P){
    this.t=1.5+Math.random()*2.5; this.st="wait"; this.first=1;
    P.forEach(p=>{ p.rtv=null; p.fs=0; p.fire=0; p.rep=0; p.msg=""; });
  },
  init(P){ this.round=0; this.done=0; this.nr(P); },
  update(dt,now,left,P,env){
    const pressed=p=>p.fire||GH.pressed(p,"A")||GH.pressed(p,"X");
    if(this.st==="wait"){
      this.t-=dt;
      P.forEach(p=>{
        if(pressed(p)){
          p.fire=0;
          if(!p.fs){ p.fs=1; p.score-=300; p.msg="False start -300"; Sfx.play("out"); }
        }
      });
      if(this.t<=0){
        this.st="go"; this.goAt=now;
        P.forEach(p=>p.fire=0);
        env.send("go",{r:this.round}); Sfx.play("count");
      }
    } else if(this.st==="go"){
      const h=now-this.goAt;
      P.forEach(p=>{
        if(pressed(p)&&!p.fs&&p.rtv==null){
          const rt=Math.max(100,Math.round(p.rep?Math.min(p.rep,h):h));
          p.rtv=rt;
          let s=Math.max(0,1000-rt);
          if(this.first){ s+=200; this.first=0; }
          p.score+=s; p.msg=rt+" ms"; Sfx.play("point");
        }
        p.fire=0;
      });
      if(P.every(p=>p.fs||p.rtv!=null)||h>2500){
        P.forEach(p=>{ if(!p.fs&&p.rtv==null)p.msg="No response"; });
        this.st="show"; this.t=2.2;
      }
    } else {
      this.t-=dt;
      if(this.t<=0){ this.round++; if(this.round>=5)this.done=1; else this.nr(P); }
    }
  },
  draw(g,W,H,P){
    const bg=this.st==="wait"?"#b3261e":this.st==="go"?"#159b50":"#241c3f";
    GH.rect(g,0,0,W,H,bg);
    if(this.st==="go")for(let i=0;i<16;i++)GH.drawStar(g,(i*139)%W,(i*83)%H,8,"rgba(255,255,255,.3)");
    if(this.st!=="show"){
      GH.text(g,this.st==="wait"?"WAIT...":"PRESS!",W/2,H*.5,Math.min(W*.12,120));
      GH.text(g,this.st==="wait"?"Don't jump the gun":"NOW!",W/2,H*.5+75,24,"#fff");
    } else P.forEach((p,i)=>GH.text(g,`${p.name}: ${p.msg}`,W/2,H*.35+i*50,30,p.c));
    GH.board(g,P);
  },
  over(){ return this.done; }
},

fruit: {
  name:"Fruit Slash", icon:"🍉", c:"#ff6b6b",
  desc:"Slash fruit before they fall. Avoid bombs.",
  help:"Right stick or mouse to aim. Press A, X or R1 to slash.",
  dur:50,
  init(P,env){
    this.items=[]; this.spawn=.5; this.particles=[]; this.elapsed=0;
    P.forEach(p=>{ p.slashCooldown=0; p.combo=0; p.sx=env.W/2; p.sy=env.H/2; p.trail=[]; });
  },
  update(dt,now,left,P,env){
    const {W,H}=env;
    this.elapsed+=dt; this.spawn-=dt;
    if(this.spawn<=0){
      this.spawn=Math.max(.32,.8-this.elapsed*.005);
      const bomb=Math.random()<.16;
      const types=["apple","strawberry","orange","watermelon","banana"];
      this.items.push({x:GH.random(70,W-70),y:H+45,vx:GH.random(-130,130),vy:GH.random(-850,-590),
        r:bomb?25:GH.random(23,31),type:bomb?"bomb":types[Math.floor(Math.random()*types.length)],
        angle:GH.random(-.4,.4),spin:GH.random(-2,2),alive:true});
    }
    this.items.forEach(o=>{
      o.x+=o.vx*dt; o.y+=o.vy*dt; o.vy+=720*dt; o.angle+=o.spin*dt;
      if(o.y>H+100)o.alive=false;
    });
    P.forEach(p=>{
      if(p.id==="kb"){ p.sx=env.mouse.x; p.sy=env.mouse.y; }
      else {
        p.sx=GH.clamp(p.sx+GH.rx(p)*W*dt*1.8,0,W);
        p.sy=GH.clamp(p.sy+GH.ry(p)*H*dt*1.8,0,H);
      }
      p.slashCooldown=Math.max(0,p.slashCooldown-dt);
      p.trail.unshift({x:p.sx,y:p.sy,life:.22}); p.trail=p.trail.slice(0,7);
      p.trail.forEach(t=>t.life-=dt); p.trail=p.trail.filter(t=>t.life>0);
      const attack=p.fire||GH.pressed(p,"A")||GH.pressed(p,"X")||GH.pressed(p,"R1");
      if(attack&&p.slashCooldown<=0){
        p.fire=0; p.slashCooldown=.22;
        let hit=false;
        this.items.forEach(o=>{
          if(!o.alive)return;
          if(Math.hypot(o.x-p.sx,o.y-p.sy)<o.r+65){
            o.alive=false; hit=true;
            if(o.type==="bomb"){
              p.score=Math.max(0,p.score-100); p.combo=0; Sfx.play("out");
              GH.particle(this.particles,o.x,o.y,"#ff8c38",20,280);
            } else {
              p.combo++; p.score+=10*p.combo; Sfx.play("hit");
              GH.particle(this.particles,o.x,o.y,["#ff5b66","#ffd447","#8ee36e","#fff"][Math.floor(Math.random()*4)],14,230);
            }
          }
        });
        if(!hit)p.combo=0;
      }
    });
    this.items=this.items.filter(o=>o.alive);
    this.particles=GH.updateParticles(this.particles,dt);
  },
  draw(g,W,H,P){
    GH.rect(g,0,0,W,H,GH.gradient(g,0,0,W,H,["#102e3b","#193d45","#101f31"]));
    for(let i=0;i<24;i++)GH.circle(g,(i*137)%W,(i*89)%H,2,"#315664");
    GH.rect(g,0,H-12,W,12,"#254c4b");
    this.items.forEach(o=>drawFruit(g,o));
    GH.drawParticles(g,this.particles);
    P.forEach(p=>{
      p.trail.forEach((t,i)=>{
        g.globalAlpha=Math.max(0,t.life/.22)*.65; g.strokeStyle=p.c; g.lineWidth=3+i*.7;
        g.beginPath(); g.arc(t.x,t.y,4+i*2,0,Math.PI*2); g.stroke();
      });
      g.globalAlpha=1; g.strokeStyle=p.c; g.lineWidth=4;
      g.beginPath(); g.arc(p.sx,p.sy,27,0,Math.PI*2); g.stroke();
      GH.text(g,p.combo?"x"+p.combo:"",p.sx,p.sy-43,20,p.c);
    });
    GH.board(g,P);
  },
  over(){ return false; }
}

};

/* =========================================================
   ARENA CLASH  -  6 fighters, one stage, full match flow
========================================================= */

const FIGHTERS = [
  {id:"frost", name:"FROST", title:"Ice Ninja", c1:"#2a6fd6", c2:"#bfeaff", skin:"#8fa6bd", accent:"#6fe0ff", look:"ninja",
   hp:100, spd:1.0, pow:1.0, kind:"ice", special:"Ice Blast", sup:"Absolute Zero",
   blurb:"Freezes foes in place. Super freezes everyone near."},
  {id:"cinder", name:"CINDER", title:"Flame Spectre", c1:"#17151c", c2:"#ff8a1f", skin:"#d7b090", accent:"#ff6a00", look:"hood",
   hp:100, spd:1.0, pow:1.08, kind:"fire", special:"Fireball", sup:"Inferno Wave",
   blurb:"Burning shots that keep hurting after impact."},
  {id:"volt", name:"VOLT", title:"Storm God", c1:"#eef3fa", c2:"#3aa0ff", skin:"#ecc7a4", accent:"#8fd8ff", look:"hat",
   hp:100, spd:1.05, pow:1.0, kind:"bolt", special:"Lightning Bolt", sup:"Thunder Judgement",
   blurb:"Lightning-fast bolts. Super rains strikes from above."},
  {id:"venom", name:"VENOM", title:"Toxic Assassin", c1:"#2c8a4c", c2:"#12301e", skin:"#a9c882", accent:"#b6ff3a", look:"ninja",
   hp:95, spd:1.08, pow:1.0, kind:"poison", special:"Acid Spit", sup:"Shadow Fang",
   blurb:"Poison damage over time. Super teleports behind you."},
  {id:"sakura", name:"SAKURA", title:"Blade Dancer", c1:"#d9487a", c2:"#2c5ec2", skin:"#f2c7a5", accent:"#ffd1e6", look:"hair",
   hp:95, spd:1.18, pow:.92, kind:"fan", special:"Razor Fan", sup:"Petal Storm",
   blurb:"Fastest fighter. Her fan flies out and returns."},
  {id:"titan", name:"TITAN", title:"Four-Armed Brute", c1:"#7a2626", c2:"#d6a43d", skin:"#c4684c", accent:"#ffcf5a", look:"horns", bare:true, arms4:true,
   hp:125, spd:.84, pow:1.18, kind:"quake", special:"Ground Shock", sup:"Earthbreaker",
   blurb:"Slow, huge and brutal. Shockwaves rip along the floor."}
];

const ATK = {
  punch:   {su:.06, ac:.08, re:.14, dmg:6,  reach:96,  h:"high", kb:170, stun:.28},
  kick:    {su:.11, ac:.10, re:.20, dmg:10, reach:118, h:"mid",  kb:280, stun:.36, heavy:1},
  uppercut:{su:.09, ac:.10, re:.32, dmg:12, reach:76,  h:"mid",  kb:120, stun:.5,  launch:600, heavy:1},
  sweep:   {su:.10, ac:.10, re:.28, dmg:8,  reach:124, h:"low",  kb:100, stun:.5,  knock:1},
  air:     {su:.03, ac:.22, re:.10, dmg:9,  reach:84,  h:"air",  kb:220, stun:.4},
  special: {su:.20, ac:.04, re:.26},
  super:   {su:.60, ac:.10, re:.55}
};

function makeFighter(){

const S={phase:"select",t:0,pt:0,F:[],proj:[],strikes:[],parts:[],fx:[],petals:[],
  camX:0,zoom:1,shake:0,flash:0,hs:0,slow:0,round:1,rt:60,winner:null,done:0,s:1,fy:0};
const STAGE=980;
const l2=(a,b,k)=>[a[0]+(b[0]-a[0])*k,a[1]+(b[1]-a[1])*k];
const rnd=(a,b)=>a+Math.random()*(b-a);

/* ------------ drawing: limbs & fighter figure ------------ */

function limb(g,sx,sy,tx,ty,l1,l2_,dir,w,c1,c2){
  const dx=tx-sx, dy=ty-sy;
  let d=Math.hypot(dx,dy);
  d=Math.max(Math.abs(l1-l2_)+1,Math.min(l1+l2_-.5,d));
  const a=Math.atan2(dy,dx);
  const A=Math.acos(Math.max(-1,Math.min(1,(l1*l1+d*d-l2_*l2_)/(2*l1*d))));
  const ea=a+dir*A, ex=sx+Math.cos(ea)*l1, ey=sy+Math.sin(ea)*l1;
  const fx=sx+Math.cos(a)*d, fy=sy+Math.sin(a)*d;
  g.lineCap="round"; g.lineJoin="round";
  g.strokeStyle="rgba(8,6,16,.9)"; g.lineWidth=w+5;
  g.beginPath(); g.moveTo(sx,sy); g.lineTo(ex,ey); g.lineTo(fx,fy); g.stroke();
  g.strokeStyle=c1; g.lineWidth=w; g.beginPath(); g.moveTo(sx,sy); g.lineTo(ex,ey); g.stroke();
  g.strokeStyle=c2; g.lineWidth=w-2; g.beginPath(); g.moveTo(ex,ey); g.lineTo(fx,fy); g.stroke();
  return [fx,fy];
}
function boot(g,x,y,c){
  g.fillStyle="rgba(8,6,16,.9)"; g.beginPath(); g.roundRect(x-11,y-12,32,16,6); g.fill();
  g.fillStyle=c; g.beginPath(); g.roundRect(x-9,y-10,28,12,5); g.fill();
}
function hand(g,x,y,c){
  g.fillStyle="rgba(8,6,16,.9)"; g.beginPath(); g.arc(x,y,9,0,7); g.fill();
  g.fillStyle=c; g.beginPath(); g.arc(x,y,7,0,7); g.fill();
}

function drawFighter(g,d,P,o){
  o=o||{};
  const t=o.t||0;
  const hipY=-88+P.drop, shY=hipY-52, ln=P.lean;
  const hx=ln+4-P.tilt*6, hy=shY-27+Math.abs(P.tilt)*3;
  const dark="rgba(8,6,16,.9)";
  g.save();
  g.lineCap="round"; g.lineJoin="round";
  if(o.k){ g.translate(0,70*o.k); g.translate(0,-88); g.rotate(-Math.PI/2*o.k); g.translate(0,88); }

  if(o.aura){
    g.save(); g.globalCompositeOperation="lighter";
    const gr=g.createRadialGradient(0,-100,10,0,-100,150);
    gr.addColorStop(0,d.accent+"cc"); gr.addColorStop(1,"rgba(0,0,0,0)");
    g.fillStyle=gr; g.globalAlpha=.55+.3*Math.sin(t*24); g.beginPath(); g.arc(0,-100,150,0,7); g.fill(); g.restore();
  }

  const armC1=d.bare?d.skin:d.c1, armC2=d.bare?d.skin:d.c2;
  // back sash / ponytail
  const sway=Math.sin(t*6)*5;
  if(d.look==="hair"){
    g.strokeStyle="#241326"; g.lineWidth=11; g.beginPath(); g.moveTo(hx-8,hy-6);
    g.quadraticCurveTo(hx-40,hy+10+sway,hx-50-sway,hy+52); g.stroke();
    g.strokeStyle="#3a2040"; g.lineWidth=5; g.beginPath(); g.moveTo(hx-8,hy-6);
    g.quadraticCurveTo(hx-38,hy+8+sway,hx-48-sway,hy+48); g.stroke();
  }
  if(d.look==="ninja"||d.look==="hood"){
    g.fillStyle=d.c2; g.beginPath(); g.moveTo(-10,hipY);g.lineTo(-38-sway,hipY+34);g.lineTo(-30-sway,hipY+42);g.lineTo(-4,hipY+12);g.closePath(); g.fill();
  }

  // extra arms (Titan) behind
  let hF2=null,hB2=null;
  if(d.arms4){ hF2=[P.hF[0]-4,P.hF[1]+30]; hB2=[P.hB[0]-4,P.hB[1]+28]; }
  if(d.arms4) limb(g,ln-6,shY+26,hB2[0],hB2[1],30,30,1,14,armC1,armC2);
  // back arm
  const hb=limb(g,ln-6,shY+8,P.hB[0],P.hB[1],32,32,1,14,armC1,armC2); hand(g,hb[0],hb[1],d.bare?d.skin:d.c2);
  // back leg
  const fb=limb(g,-6,hipY+12,P.fB[0],P.fB[1],44,46,-1,18,d.c1,d.c1); boot(g,fb[0],fb[1],d.c2);

  // torso
  g.fillStyle=d.bare?d.skin:d.c1; g.beginPath();
  g.moveTo(ln-19,shY); g.lineTo(ln+19,shY); g.lineTo(12,hipY+6); g.lineTo(-12,hipY+6); g.closePath(); g.fill();
  g.strokeStyle=dark; g.lineWidth=3; g.stroke();
  if(!d.bare){
    g.fillStyle=d.c2; g.beginPath(); g.moveTo(ln-5,shY);g.lineTo(ln+6,shY);g.lineTo(4,hipY+6);g.lineTo(-4,hipY+6);g.closePath(); g.fill();
    g.fillStyle="rgba(255,255,255,.12)"; g.beginPath(); g.moveTo(ln-19,shY);g.lineTo(ln-6,shY);g.lineTo(-4,hipY+6);g.lineTo(-12,hipY+6);g.closePath(); g.fill();
  } else {
    g.strokeStyle=d.c2; g.lineWidth=6; g.beginPath(); g.moveTo(ln-16,shY+2); g.lineTo(10,hipY); g.moveTo(ln+16,shY+2); g.lineTo(-10,hipY); g.stroke();
    g.strokeStyle="rgba(0,0,0,.25)"; g.lineWidth=2; g.beginPath(); g.moveTo(ln,shY+10); g.lineTo(2,hipY-8); g.moveTo(ln-10,shY+22); g.lineTo(ln+9,shY+22); g.stroke();
  }
  // shoulder guards
  [-1,1].forEach(s=>{ g.fillStyle=d.c2; g.strokeStyle=dark; g.lineWidth=2.5; g.beginPath(); g.arc(ln+s*14,shY+5,9,0,7); g.fill(); g.stroke(); });
  // hips / belt
  g.fillStyle=d.bare?"#3a2418":d.c1; g.strokeStyle=dark; g.lineWidth=2.5; g.beginPath(); g.roundRect(-14,hipY-1,28,24,6); g.fill(); g.stroke();
  g.fillStyle=d.c2; g.beginPath(); g.roundRect(-14,hipY-2,28,9,3); g.fill();
  g.fillStyle=d.accent; g.beginPath(); g.arc(0,hipY+2.5,4,0,7); g.fill();

  // front leg
  const ff=limb(g,6,hipY+12,P.fF[0],P.fF[1],44,46,-1,18,d.c1,d.c1);
  // knee pad
  boot(g,ff[0],ff[1],d.c2);

  // head
  if(d.look==="hood"){
    g.fillStyle=d.c1; g.strokeStyle=dark; g.lineWidth=3; g.beginPath(); g.arc(hx-3,hy,21,0,7); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(hx-14,hy-14); g.lineTo(hx-34-sway,hy-4); g.lineTo(hx-16,hy+8); g.closePath(); g.fill();
    g.fillStyle="#0b080d"; g.beginPath(); g.ellipse(hx+5,hy+1,14,16,0,0,7); g.fill();
    // flame crest
    for(let i=0;i<4;i++){ const fl=Math.sin(t*14+i*1.7)*4;
      g.fillStyle=i%2?"#ffd23f":d.accent; g.beginPath(); g.moveTo(hx-12+i*7,hy-18); g.lineTo(hx-9+i*7,hy-34-fl-i*2); g.lineTo(hx-4+i*7,hy-18); g.fill(); }
  } else if(d.look==="ninja"){
    g.fillStyle=d.c1; g.strokeStyle=dark; g.lineWidth=3; g.beginPath(); g.arc(hx,hy,18,0,7); g.fill(); g.stroke();
    g.fillStyle="#0e0a14"; g.beginPath(); g.roundRect(hx-2,hy-9,22,10,5); g.fill();
    g.fillStyle=d.accent; g.beginPath(); g.roundRect(hx-6,hy+2,26,16,8); g.fill();
    g.save(); g.beginPath(); g.arc(hx,hy,18,0,7); g.clip();
    g.fillStyle="rgba(0,0,0,.28)"; for(let i=0;i<4;i++) g.fillRect(hx+2+i*5,hy+4,1.5,12); g.restore();
    g.fillStyle=d.c2; g.beginPath(); g.moveTo(hx-16,hy-4); g.lineTo(hx-36-sway,hy+6); g.lineTo(hx-18,hy+6); g.fill();
  } else {
    g.fillStyle=d.skin; g.strokeStyle=dark; g.lineWidth=3; g.beginPath(); g.arc(hx,hy,17,0,7); g.fill(); g.stroke();
    g.fillStyle="rgba(0,0,0,.12)"; g.beginPath(); g.arc(hx-4,hy+5,13,0,Math.PI); g.fill();
  }
  // eyes
  if(d.look==="hood"||d.look==="ninja"){
    g.fillStyle=d.look==="hood"?"#ffb02e":d.accent;
    [[hx+9,hy-3.5,6],[hx+1,hy-4,4.5]].forEach(e=>{ g.save(); g.translate(e[0],e[1]); g.rotate(-.3); g.beginPath(); g.ellipse(0,0,e[2],2.4,0,0,7); g.fill(); g.restore(); });
    GH.glow(g,hx+8,hy-3,14,d.look==="hood"?"#ff9a1f":d.accent,.7);
  } else {
    g.fillStyle="#fff"; g.beginPath(); g.ellipse(hx+8,hy-3,5,3.2,-.15,0,7); g.fill();
    g.fillStyle=d.look==="hat"?d.accent:"#1b1220"; g.beginPath(); g.arc(hx+10,hy-3,2.2,0,7); g.fill();
    g.strokeStyle="#1b1220"; g.lineWidth=2.6; g.beginPath(); g.moveTo(hx+2,hy-9); g.lineTo(hx+14,hy-6); g.stroke();
    g.beginPath(); g.moveTo(hx+5,hy+8); g.lineTo(hx+14,hy+8); g.stroke();
  }
  if(d.look==="hat"){
    g.fillStyle="#eef3fa"; g.beginPath(); g.moveTo(hx-14,hy+4); g.quadraticCurveTo(hx,hy+34,hx+10,hy+26); g.lineTo(hx+8,hy+8); g.fill();
    g.fillStyle="#d8c486"; g.strokeStyle=dark; g.lineWidth=3; g.beginPath(); g.moveTo(hx-40,hy-10); g.lineTo(hx,hy-42); g.lineTo(hx+40,hy-10); g.quadraticCurveTo(hx,hy-2,hx-40,hy-10); g.fill(); g.stroke();
    g.strokeStyle="rgba(120,90,40,.6)"; g.lineWidth=1.5; for(let i=1;i<4;i++){ g.beginPath(); g.moveTo(hx-40+i*9,hy-10-i*7); g.lineTo(hx+40-i*9,hy-10-i*7); g.stroke(); }
    g.fillStyle=d.c2; g.fillRect(hx-18,hy-14,36,4);
  }
  if(d.look==="hair"){
    g.fillStyle="#241326"; g.beginPath(); g.arc(hx-1,hy-3,19,Math.PI*.95,Math.PI*2.1); g.lineTo(hx+16,hy-6); g.lineTo(hx-14,hy+4); g.fill();
    g.fillStyle=d.c1; g.fillRect(hx-17,hy-14,34,5);
    g.fillStyle=d.accent; g.beginPath(); g.arc(hx-14,hy-12,5,0,7); g.fill();
  }
  if(d.look==="horns"){
    g.fillStyle=d.c2; g.strokeStyle=dark; g.lineWidth=2.5;
    g.beginPath(); g.moveTo(hx-8,hy-12); g.quadraticCurveTo(hx-22,hy-26,hx-12,hy-42); g.quadraticCurveTo(hx-8,hy-28,hx+2,hy-16); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(hx+6,hy-14); g.quadraticCurveTo(hx+16,hy-30,hx+30,hy-36); g.quadraticCurveTo(hx+20,hy-22,hx+14,hy-10); g.fill(); g.stroke();
    g.fillStyle="#2a1810"; g.fillRect(hx+1,hy+8,14,10);
    g.fillStyle="rgba(0,0,0,.35)"; g.fillRect(hx-2,hy-8,20,4);
  }

  // front extra arm (Titan)
  if(d.arms4){ const e=limb(g,ln+6,shY+26,hF2[0],hF2[1],30,30,1,14,armC1,armC2); hand(g,e[0],e[1],d.skin); }
  // front arm
  const hf=limb(g,ln+8,shY+8,P.hF[0],P.hF[1],32,32,1,14,armC1,armC2); hand(g,hf[0],hf[1],d.bare?d.skin:d.c2);
  g.restore();
}

function poseFor(f,t){
  const d=f.def, st=f.st, a=ATK[st], tt=f.stT;
  const bob=Math.sin(t*3+f.ph);
  const P={drop:8+bob*1.6,lean:3,tilt:0,hF:[36,-146+bob*2],hB:[22,-134],fF:[30,0],fB:[-26,0],k:0,aura:false};
  if(f.y>2){ P.drop=0; P.fF=[30,-34]; P.fB=[-16,-20]; P.hF=[40,-152]; P.hB=[20,-144]; }
  else if(Math.abs(f.vx)>30 && (st==="idle")){
    const ph=f.anim, hop=Math.abs(Math.sin(ph))*3;
    P.fF=[30+Math.sin(ph)*36,-Math.max(0,Math.cos(ph))*16]; P.fB=[-26-Math.sin(ph)*36,-Math.max(0,-Math.cos(ph))*16];
    P.drop+=hop; P.lean=6; P.hF[1]+=Math.sin(ph)*3;
  }
  if(st==="crouch"){ P.drop=40; P.fF=[44,0]; P.fB=[-30,0]; P.hF=[40,-118]; P.hB=[24,-110]; }
  if(st==="block"){ P.hF=[32,-158]; P.hB=[26,-148]; P.lean=-5; if(f.crouching){P.drop=40;P.fF=[44,0];P.fB=[-30,0];P.hF=[32,-124];P.hB=[26,-116];} }
  if(a){
    let k; const su=a.su,ac=a.ac,re=a.re;
    if(tt<su)k=-.35*(tt/su); else if(tt<su+ac)k=-.35+1.35*((tt-su)/ac); else k=1-Math.min(1,(tt-su-ac)/re);
    if(st==="punch"){ P.hF=l2([36,-146],[108,-150],k); P.lean=3+11*k; P.hB=[16,-136]; }
    else if(st==="kick"){ P.fF=l2([30,0],[90,-112],k); P.lean=-7*k; P.hB=[10,-150]; P.hF=[30,-150]; }
    else if(st==="uppercut"){ P.drop=22*k; P.hF=l2([36,-146],[60,-212],k); P.lean=7*k; P.hB=[10,-130]; }
    else if(st==="sweep"){ P.drop=44; P.fF=l2([40,0],[116,-6],k); P.hF=[30,-112]; P.lean=-12*k; }
    else if(st==="air"){ P.fF=l2([30,-34],[88,-72],k); P.hF=[30,-150]; P.lean=-6*k; }
    else if(st==="special"){ P.hF=l2([36,-146],[82,-142],k); P.hB=l2([22,-134],[66,-134],k); P.lean=9*k; P.drop+=6*k; }
    else if(st==="super"){ P.hF=l2([36,-146],[22,-226],Math.min(1,tt/.4)); P.hB=l2([22,-134],[4,-216],Math.min(1,tt/.4)); P.lean=-4; P.aura=true; P.drop=4; }
  }
  if(st==="hit"){ P.lean=-16; P.tilt=-.45; P.hF=[8,-122]; P.hB=[-12,-126]; P.drop=6; }
  if(st==="win"){ const w=Math.sin(t*8); P.hF=[16,-224+w*8]; P.hB=[-8,-218-w*8]; P.drop=0; P.lean=0; }
  return P;
}

function dummy(def){ return {def,st:"idle",stT:0,y:0,vx:0,anim:0,ph:0,crouching:false}; }

/* ------------ setup / flow ------------ */

function newF(p,def,bot,i){
  return {p,def,bot,i,name:bot?"CPU":p.name,c:bot?"#ff5d5d":p.c,x:0,y:0,vx:0,vy:0,face:1,hp:def.hp,max:def.hp,ghost:def.hp,
    meter:0,st:"idle",stT:0,hitDone:false,fired:false,cool:0,inv:0,frozen:0,dot:0,dotT:0,dotK:0,combo:0,comboT:0,wins:0,
    anim:0,ph:Math.random()*6,crouching:false,blocking:false,launched:false,stun:0,airUsed:false,
    ai:{t:0,mode:"approach",fresh:false}};
}

function startRound(){
  const n=S.F.length;
  S.F.forEach((f,i)=>{
    f.x=(i-(n-1)/2)*340; f.y=0; f.vx=f.vy=0; f.hp=f.max; f.ghost=f.max; f.st="idle"; f.stT=0;
    f.frozen=0; f.dot=0; f.combo=0; f.comboT=0; f.cool=0; f.inv=0; f.launched=false; f.face=i<n/2?1:-1;
  });
  S.proj=[]; S.strikes=[]; S.phase="intro"; S.pt=0; S.rt=60; S.winner=null; S.slow=0;
  Sfx.play("start");
}

function beginVersus(P){
  S.F=P.map(p=>newF(p,FIGHTERS[p.cs],false));
  if(P.length===1){
    let k; do{k=Math.floor(Math.random()*FIGHTERS.length);}while(k===P[0].cs);
    S.F.push(newF(null,FIGHTERS[k],true));
  }
  S.F.forEach((f,i)=>f.i=i);
  S.phase="versus"; S.pt=0; S.round=1; Sfx.play("start");
}

function endRound(win){
  S.phase="roundend"; S.pt=0; S.winner=win||null; S.slow=Math.max(S.slow,1.2);
  if(win){ win.wins++; if(win.p)win.p.score+=200; }
  Sfx.play("win");
}

/* ------------ combat ------------ */

function spark(x,y,c,n=10,sp=300){ GH.particle(S.parts,x,y,c,n,sp); }
function nearestEnemy(f){
  let b=null,bd=1e9;
  S.F.forEach(e=>{ if(e===f||e.hp<=0)return; const d=Math.abs(e.x-f.x); if(d<bd){bd=d;b=e;} });
  return b;
}

function applyHit(att,t,dmg,o){
  if(t.inv>0||t.hp<=0||t.st==="ko"||t.st==="down"||t.st==="getup")return false;
  const dirAway=Math.sign(t.x-att.x)||att.face;
  const front=Math.sign(att.x-t.x||1)===t.face;
  const hitY=t.y+110;
  if(t.st==="block"&&front&&!o.unblock){
    t.hp=Math.max(1,t.hp-Math.max(.5,dmg*.12)); t.vx=dirAway*190; t.meter=Math.min(100,t.meter+3);
    spark(t.x+(-dirAway)*30,-hitY,"#7ce7ff",8,220); S.fx.push({x:t.x-dirAway*28,y:-hitY,t:.14,m:.14,k:"block"});
    S.hs=.03; Sfx.play("hit"); return true;
  }
  dmg*=Math.max(.4,1-.09*att.combo);
  t.hp=Math.max(0,t.hp-dmg);
  att.meter=Math.min(100,att.meter+dmg*1.5+3); t.meter=Math.min(100,t.meter+dmg*.8);
  if(att.p)att.p.score+=Math.round(dmg);
  att.combo++; att.comboT=1.2;
  t.st="hit"; t.stT=0; t.stun=o.stun||.3; t.vx=dirAway*(o.kb||200); t.face=-dirAway;
  t.hitDone=false; t.fired=false;
  if(o.launch||o.knock||t.y>0){ t.launched=true; t.vy=o.launch||(o.knock?430:320); t.y=Math.max(t.y,.1); }
  if(o.freeze){ t.frozen=o.freeze; spark(t.x,-hitY,"#bfeaff",16,260); }
  if(o.dot){ t.dot=Math.max(t.dot,o.dot); t.dotK=o.dotK||0; }
  S.fx.push({x:t.x-dirAway*18,y:-hitY,t:.2,m:.2,k:"hit",c:att.def.accent});
  spark(t.x-dirAway*14,-hitY,att.def.accent,10,330);
  S.hs=o.heavy?.09:.05; S.shake=Math.max(S.shake,Math.min(18,dmg*.9));
  Sfx.play("hit");
  if(t.hp<=0){
    t.st="ko"; t.stT=0; t.vy=520; t.y=Math.max(t.y,.1); t.vx=dirAway*430; t.launched=false; t.frozen=0;
    S.slow=1.5; S.shake=24; S.flash=.35; Sfx.play("out");
    spark(t.x,-hitY,"#fff",26,420);
  }
  return true;
}

function meleeHit(f,a){
  let any=false;
  S.F.forEach(t=>{
    if(t===f||t.hp<=0||t.st==="ko")return;
    const dx=(t.x-f.x)*f.face;
    if(dx<-30||dx>a.reach+22)return;
    if(a.h==="high"&&t.st==="crouch")return;
    if(a.h==="low"&&t.y>40)return;
    if(Math.abs(t.y-f.y)>120)return;
    if(applyHit(f,t,a.dmg*f.def.pow,a))any=true;
  });
  if(any)f.hitDone=true;
}

function addProj(f,p){
  S.proj.push(Object.assign({x:f.x+f.face*60,y:f.y+110,vx:f.face*600,owner:f,life:2.2,age:0,hit:new Set(),r:30,dmg:8,o:{},k:f.def.kind},p));
}

function fireSpecial(f){
  const d=f.face, k=f.def.kind;
  f.meter=Math.min(100,f.meter+4);
  if(k==="ice") addProj(f,{vx:d*660,dmg:9,o:{kb:200,stun:.3,freeze:.9}}),f.cool=1.2;
  else if(k==="fire") addProj(f,{vx:d*540,dmg:10,r:34,o:{kb:220,stun:.34,dot:2.4,dotK:1}}),f.cool=1.1;
  else if(k==="bolt") addProj(f,{vx:d*1000,dmg:9,r:26,o:{kb:300,stun:.5}}),f.cool=.9;
  else if(k==="poison") addProj(f,{vx:d*470,y:f.y+85,dmg:7,r:34,o:{kb:120,stun:.3,dot:3.2,dotK:2}}),f.cool=1.2;
  else if(k==="fan") addProj(f,{vx:d*640,dmg:8,ret:true,o:{kb:160,stun:.3}}),f.cool=1.3;
  else addProj(f,{vx:d*440,y:f.y,r:46,ground:true,dmg:11,o:{kb:260,stun:.5,launch:430}}),f.cool=1.4;
}

function fireSuper(f){
  const d=f.face, k=f.def.kind, pw=f.def.pow;
  S.flash=.5; S.shake=16; Sfx.play("start");
  S.fx.push({x:f.x,y:-100,t:.6,m:.6,k:"ring",c:f.def.accent});
  if(k==="ice"){
    S.F.forEach(e=>{ if(e!==f&&e.hp>0&&Math.abs(e.x-f.x)<640) applyHit(f,e,24*pw,{stun:.7,freeze:1.8,kb:300,launch:300,heavy:1,unblock:true}); });
  } else if(k==="fire"){
    addProj(f,{vx:d*780,r:80,dmg:30,pierce:true,o:{kb:420,stun:.6,dot:3,dotK:1,launch:380,heavy:1,unblock:true},life:1.8});
  } else if(k==="bolt"){
    S.F.forEach(e=>{ if(e!==f&&e.hp>0) S.strikes.push({x:e.x,t:.45,m:.45,owner:f}); });
    if(!S.strikes.some(s=>s.owner===f)) S.strikes.push({x:f.x+d*220,t:.45,m:.45,owner:f});
  } else if(k==="fan"){
    for(let i=0;i<5;i++) addProj(f,{vx:d*(560+i*70),y:f.y+30+i*34,dmg:6,pierce:true,r:30,o:{kb:200,stun:.35,unblock:true}});
  } else if(k==="poison"){
    const e=nearestEnemy(f);
    if(e){ spark(f.x,-100,"#b6ff3a",20,300); f.x=GH.clamp(e.x-e.face*80,-STAGE+40,STAGE-40); f.face=e.x>f.x?1:-1; spark(f.x,-100,"#b6ff3a",20,300);
      applyHit(f,e,28*pw,{stun:.7,kb:420,launch:380,dot:3.5,dotK:2,heavy:1,unblock:true}); }
  } else {
    [-1,1].forEach(s=>addProj(f,{vx:s*520,y:f.y,r:64,ground:true,pierce:true,dmg:26,o:{kb:420,stun:.7,launch:560,heavy:1,unblock:true},x:f.x+s*50}));
  }
}

function startAttack(f,name){
  f.st=name; f.stT=0; f.hitDone=false; f.fired=false;
  if(name==="super"){ f.meter=0; f.inv=.9; }
}

/* ------------ AI ------------ */

function botInput(f,dt){
  const inp={x:0,y:0,block:false,punch:false,kick:false,special:false,sup:false};
  const tg=nearestEnemy(f); if(!tg)return inp;
  const ai=f.ai, dist=Math.abs(tg.x-f.x), dir=Math.sign(tg.x-f.x)||1;
  ai.t-=dt; ai.fresh=false;
  const threat=["punch","kick","uppercut","sweep","air","special","super"].includes(tg.st)&&dist<260;
  if(threat&&Math.random()<dt*3.2){ ai.mode="block"; ai.t=rnd(.25,.55); }
  else if(ai.t<=0){
    ai.t=rnd(.18,.5); ai.fresh=true;
    const r=Math.random();
    if(dist>440) ai.mode=r<.4?"zap":"approach";
    else if(dist>170) ai.mode=r<.55?"approach":r<.75?"zap":"jump";
    else ai.mode=r<.42?"punch":r<.7?"kick":r<.8?"back":r<.9?"crouchA":"block";
  }
  if(f.meter>=100&&dist<420&&ai.fresh) inp.sup=true;
  switch(ai.mode){
    case "approach": inp.x=dir; break;
    case "back": inp.x=-dir; break;
    case "block": inp.block=true; break;
    case "jump": if(ai.fresh){inp.y=-1;inp.x=dir;} break;
    case "zap": if(ai.fresh)inp.special=true; break;
    case "punch": if(ai.fresh)inp.punch=true; break;
    case "kick": if(ai.fresh)inp.kick=true; break;
    case "crouchA": inp.y=1; if(ai.fresh)inp.punch=true; break;
  }
  return inp;
}

function humanInput(p){
  const x=Number(p.pad?.x)||0, y=Number(p.pad?.y)||0, J=p.just, H=p.held;
  return {x:Math.abs(x)>.25?x:0,y:Math.abs(y)>.5?y:0,
    block:H.has("X")||H.has("L1")||H.has("L2"),
    punch:J.has("A"),kick:J.has("B"),special:J.has("Y"),sup:J.has("R1")||J.has("R2")};
}

/* ------------ fighter step ------------ */

function stepFighter(f,dt,inp){
  f.stT+=dt; f.cool=Math.max(0,f.cool-dt); f.inv=Math.max(0,f.inv-dt);
  if(f.comboT>0){ f.comboT-=dt; if(f.comboT<=0)f.combo=0; }
  if(f.dot>0&&f.hp>0){
    f.dot-=dt; f.dotT+=dt;
    if(f.dotT>=.45){ f.dotT=0; f.hp=Math.max(1,f.hp-(f.dotK===1?2.2:1.6)); spark(f.x,-rnd(40,160),f.dotK===1?"#ff9a1f":"#b6ff3a",3,90); }
  }
  if(f.frozen>0){ f.frozen-=dt; inp=null; if(f.frozen<=0)spark(f.x,-100,"#bfeaff",18,300); }
  const atk=ATK[f.st];
  const stunned=f.st==="hit"||f.st==="down"||f.st==="ko"||f.st==="getup";
  const grounded=f.y<=0&&f.vy<=0;
  f.blocking=false; f.crouching=false;

  if(inp&&!atk&&!stunned&&f.st!=="win"){
    if(grounded){
      f.airUsed=false;
      f.crouching=inp.y>.5; f.blocking=inp.block;
      if(f.blocking){ if(f.st!=="block"){f.st="block";f.stT=0;} f.vx*=Math.pow(.001,dt); }
      else if(f.crouching){ f.st="crouch"; f.vx*=Math.pow(.001,dt); }
      else {
        f.st="idle";
        const back=inp.x*f.face<0;
        const sp=inp.x*300*f.def.spd*(back?.8:1);
        f.vx+=(sp-f.vx)*Math.min(1,dt*14);
        if(inp.y<-.5){ f.vy=930; f.y=.1; f.vx=inp.x*340*f.def.spd; }
      }
      if(f.st!=="idle"||true){
        if(inp.punch) startAttack(f,f.crouching?"uppercut":"punch");
        else if(inp.kick) startAttack(f,f.crouching?"sweep":"kick");
        else if(inp.special&&f.cool<=0) startAttack(f,"special");
        else if(inp.sup&&f.meter>=100) startAttack(f,"super");
      }
    } else {
      f.vx+=inp.x*700*dt; f.vx=GH.clamp(f.vx,-380*f.def.spd,380*f.def.spd);
      if((inp.punch||inp.kick)&&!f.airUsed){ f.airUsed=true; startAttack(f,"air"); }
    }
  } else if(!inp&&grounded&&f.st==="block"){ f.st="idle"; }

  if(f.st==="block"&&!inp) f.st="idle";
  if(f.st==="crouch"&&!inp) f.st="idle";

  // attack progression
  const a=ATK[f.st];
  if(a){
    const t=f.stT, total=a.su+a.ac+a.re;
    if(f.st==="punch"||f.st==="kick"){ if(t<a.su+a.ac) f.vx=f.face*70; else f.vx*=Math.pow(.01,dt); }
    else if(f.st==="special"||f.st==="super"||f.st==="uppercut"||f.st==="sweep"){ if(grounded)f.vx*=Math.pow(.002,dt); }
    if(a.dmg&&!f.hitDone&&t>=a.su&&t<a.su+a.ac) meleeHit(f,a);
    if(f.st==="special"&&!f.fired&&t>=a.su){ f.fired=true; fireSpecial(f); }
    if(f.st==="super"&&!f.fired&&t>=a.su){ f.fired=true; fireSuper(f); }
    if(t>=total){ f.st="idle"; f.stT=0; }
  }
  if(f.st==="hit"&&f.stT>=f.stun&&f.y<=0){ f.st="idle"; f.stT=0; }
  if(f.st==="down"){ f.vx*=Math.pow(.02,dt); if(f.stT>.95){ f.st="getup"; f.stT=0; f.inv=.6; } }
  if(f.st==="getup"&&f.stT>.3){ f.st="idle"; f.stT=0; }
  if(f.st==="ko") f.vx*=f.y<=0?Math.pow(.03,dt):1;
  if(f.st==="hit"&&f.y<=0) f.vx*=Math.pow(.02,dt);

  // physics
  if(f.y>0||f.vy>0){
    f.vy-=2400*dt; f.y+=f.vy*dt;
    if(f.y<=0){
      f.y=0; f.vy=0;
      spark(f.x,-4,"#cdb8e0",5,120);
      if(f.st==="hit"&&f.launched){ f.st="down"; f.stT=0; f.launched=false; S.shake=Math.max(S.shake,8); }
      else if(f.st==="air"){ f.st="idle"; f.stT=0; }
    }
  }
  f.x+=f.vx*dt;
  f.x=GH.clamp(f.x,-STAGE+40,STAGE-40);
  if(Math.abs(f.vx)>30&&grounded) f.anim+=dt*Math.abs(f.vx)*.034*((f.vx*f.face)>=0?1:-1);
}

function updateProj(dt){
  S.proj.forEach(p=>{
    p.x+=p.vx*dt; p.life-=dt; p.age+=dt;
    if(p.k==="fan"&&p.ret&&!p.back&&p.age>.55){ p.vx*=-1; p.back=true; p.hit.clear(); }
    if(Math.random()<dt*40)GH.particle(S.parts,p.x,-p.y,p.k==="ice"?"#bfeaff":p.k==="fire"?"#ff9a1f":p.k==="poison"?"#b6ff3a":p.k==="bolt"?"#8fd8ff":"#fff",1,50);
    S.F.forEach(t=>{
      if(t===p.owner||t.hp<=0||p.hit.has(t)||t.st==="ko")return;
      if(Math.abs(p.x-t.x)>p.r+22)return;
      const top=t.st==="crouch"?85:165;
      const inY=p.ground?t.y<35:(p.y>=t.y-p.r*.6&&p.y<=t.y+top+p.r*.6);
      if(!inY)return;
      if(applyHit(p.owner,t,p.dmg*p.owner.def.pow,p.o)){
        p.hit.add(t);
        if(!p.pierce&&!(p.k==="fan"))p.life=0;
      }
    });
  });
  S.proj=S.proj.filter(p=>p.life>0&&Math.abs(p.x)<STAGE+400);
  S.strikes.forEach(s=>{
    s.t-=dt;
    if(s.t<=0&&!s.done){
      s.done=true; S.flash=.4; S.shake=14; Sfx.play("hit");
      S.fx.push({x:s.x,y:-300,t:.35,m:.35,k:"bolt"});
      S.F.forEach(t=>{ if(t!==s.owner&&t.hp>0&&Math.abs(t.x-s.x)<95) applyHit(s.owner,t,30*s.owner.def.pow,{stun:.7,kb:300,launch:480,heavy:1,unblock:true}); });
    }
  });
  S.strikes=S.strikes.filter(s=>!s.done);
}

/* ------------ main hooks ------------ */

function simulate(dt,P,live){
  S.F.forEach(f=>{
    let inp=null;
    if(live&&f.hp>0){
      inp=f.bot?botInput(f,dt):humanInput(f.p);
    }
    // facing toward nearest enemy when free
    const free=!ATK[f.st]&&!["hit","down","ko","getup"].includes(f.st);
    if(free&&f.hp>0){ const e=nearestEnemy(f); if(e)f.face=e.x>f.x?1:-1; }
    stepFighter(f,dt,inp);
    f.ghost+=(f.hp-f.ghost)*Math.min(1,dt*(f.ghost>f.hp?1.6:10));
  });
  // push apart
  for(let i=0;i<S.F.length;i++)for(let j=i+1;j<S.F.length;j++){
    const a=S.F[i],b=S.F[j];
    if(a.y>40||b.y>40||a.hp<=0||b.hp<=0)continue;
    const dx=b.x-a.x;
    if(Math.abs(dx)<48){ const push=(48-Math.abs(dx))/2*Math.sign(dx||1); a.x-=push; b.x+=push; }
  }
  updateProj(dt);
}

function updateCamera(dt,W,H){
  const alive=S.F.length?S.F:[];
  if(!alive.length)return;
  const xs=alive.map(f=>f.x), mn=Math.min(...xs), mx=Math.max(...xs);
  const s0=H/720, spread=mx-mn;
  const tz=GH.clamp((W/s0)/(spread+560),.7,1.15);
  S.zoom+=(tz-S.zoom)*Math.min(1,dt*4);
  S.camX+=((mn+mx)/2-S.camX)*Math.min(1,dt*6);
  S.s=s0*S.zoom; S.fy=H*.8;
  // keep everyone on screen
  const maxSpread=(W/s0/.7)-560;
  if(spread>maxSpread){
    const c=(mn+mx)/2;
    S.F.forEach(f=>{ f.x=GH.clamp(f.x,c-maxSpread/2,c+maxSpread/2); });
  }
}

return {
  name:"Arena Clash", icon:"🥊", c:"#ff9f43",
  desc:"6 fighters, special moves and a best-of-3 match.",
  help:"Stick: move / jump / crouch. A punch, B kick, X block, Y special, R1 super.",
  dur:900,

  hud(){ return ""; },

  init(P,env){
    Object.assign(S,{phase:"select",t:0,pt:0,F:[],proj:[],strikes:[],parts:[],fx:[],camX:0,zoom:1,shake:0,flash:0,hs:0,slow:0,round:1,rt:60,winner:null,done:0});
    S.petals=Array.from({length:34},(_,i)=>({x:GH.hash(i)*1400-700,y:GH.hash(i+50)*700,vx:-20-GH.hash(i+9)*30,vy:20+GH.hash(i+3)*30,r:2+GH.hash(i+7)*3,ph:GH.hash(i)*6}));
    P.forEach((p,i)=>{ p.cs=i%FIGHTERS.length; p.locked=false; p.score=0; p._nav=false; });
  },

  update(dt,now,left,P,env){
    const W=env.W,H=env.H;
    S.t+=dt; S.shake=Math.max(0,S.shake-dt*40); S.flash=Math.max(0,S.flash-dt);
    P.forEach(p=>GH.poll(p));
    S.petals.forEach(q=>{ q.x+=q.vx*dt; q.y+=q.vy*dt; q.ph+=dt*2; if(q.y>760){q.y=-20;q.x=Math.random()*1400-700;} if(q.x<-720)q.x=720; });
    S.fx.forEach(f=>f.t-=dt); S.fx=S.fx.filter(f=>f.t>0);
    S.parts=GH.updateParticles(S.parts,dt);

    if(S.phase==="select"){
      P.forEach(p=>{
        const x=Number(p.pad?.x)||0;
        if(!p.locked){
          if(Math.abs(x)>.6&&!p._nav){ p.cs=(p.cs+Math.sign(x)+FIGHTERS.length)%FIGHTERS.length; p._nav=true; Sfx.play("count"); }
          if(Math.abs(x)<.3)p._nav=false;
          if(S.t>.6&&(p.just.has("A")||p.just.has("START"))){ p.locked=true; Sfx.play("point"); }
        } else if(p.just.has("B")) p.locked=false;
      });
      if(P.length&&P.every(p=>p.locked)) beginVersus(P);
      return;
    }
    if(S.phase==="versus"){
      S.pt+=dt;
      if(S.pt>2.6){ startRound(); }
      return;
    }

    // time scaling
    let sdt=dt;
    if(S.slow>0){ S.slow-=dt; sdt=dt*.3; }
    if(S.hs>0){ S.hs-=dt; sdt=0; }

    if(S.phase==="intro"){
      S.pt+=dt; simulate(sdt,P,false);
      if(S.pt>2.1){ S.phase="fight"; S.pt=0; }
    } else if(S.phase==="fight"){
      S.rt-=sdt; simulate(sdt,P,true);
      const alive=S.F.filter(f=>f.hp>0);
      if(alive.length<=1) endRound(alive[0]);
      else if(S.rt<=0){
        const best=[...alive].sort((a,b)=>b.hp/b.max-a.hp/a.max);
        endRound(best[0].hp/best[0].max-best[1].hp/best[1].max>.005?best[0]:null);
      }
    } else if(S.phase==="roundend"){
      S.pt+=dt; simulate(sdt,P,false);
      if(S.winner&&S.pt>1.2&&S.winner.st==="idle")S.winner.st="win";
      if(S.pt>3.4){
        if(S.winner&&S.winner.wins>=2){ S.phase="matchend"; S.pt=0; Sfx.play("win"); }
        else { S.round++; startRound(); }
      }
    } else if(S.phase==="matchend"){
      S.pt+=dt; simulate(sdt,P,false);
      if(S.pt>4.5)S.done=1;
    }
    updateCamera(dt,W,H);
  },

  draw(g,W,H,P){
    S.W=W; S.H=H;
    if(S.phase==="select") return drawSelect(g,W,H,P);
    if(S.phase==="versus") return drawVersus(g,W,H);
    drawStage(g,W,H);
    drawWorld(g,W,H);
    drawHUD(g,W,H);
    drawAnnouncer(g,W,H);
    // flash + vignette
    if(S.flash>0){ g.fillStyle=`rgba(255,255,255,${Math.min(.7,S.flash*1.6)})`; g.fillRect(0,0,W,H); }
    const vg=g.createRadialGradient(W/2,H/2,H*.35,W/2,H/2,H*.95);
    vg.addColorStop(0,"rgba(0,0,0,0)"); vg.addColorStop(1,"rgba(6,2,14,.62)"); g.fillStyle=vg; g.fillRect(0,0,W,H);
  },

  over(){ return !!S.done; }
};

/* ------------ stage ------------ */

function mountains(g,W,fy,s0,par,baseH,amp,color,seed){
  g.fillStyle=color; g.beginPath(); g.moveTo(0,fy);
  for(let x=0;x<=W+20;x+=18){
    const wx=x/s0+S.camX*par;
    const h=baseH+amp*(Math.sin(wx*.0036+seed)+Math.sin(wx*.0097+seed*2)*.5+Math.sin(wx*.021+seed*3)*.2);
    g.lineTo(x,fy-h*s0);
  }
  g.lineTo(W+20,fy); g.closePath(); g.fill();
}
function pagoda(g,x,y,sc,color){
  g.save(); g.translate(x,y); g.scale(sc,sc); g.fillStyle=color;
  for(let i=0;i<5;i++){
    const w=150-i*22, yy=-i*58;
    g.fillRect(-w*.34,yy-44,w*.68,44);
    g.beginPath(); g.moveTo(-w*.62,yy-44); g.quadraticCurveTo(-w*.4,yy-46,-w*.3,yy-62); g.lineTo(w*.3,yy-62); g.quadraticCurveTo(w*.4,yy-46,w*.62,yy-44);
    g.quadraticCurveTo(0,yy-36,-w*.62,yy-44); g.fill();
    g.fillStyle="rgba(255,190,90,.75)"; g.fillRect(-4,yy-34,8,16); g.fillStyle=color;
  }
  g.fillRect(-3,-5*58-62,6,50);
  g.restore();
}
function lantern(g,x,y,s){
  g.fillStyle="#3a1010"; g.fillRect(x-1.5*s,y-26*s,3*s,10*s);
  g.fillStyle="#d8352f"; g.beginPath(); g.ellipse(x,y,10*s,14*s,0,0,7); g.fill();
  g.fillStyle="#ffcf6a"; g.beginPath(); g.ellipse(x,y,5*s,9*s,0,0,7); g.fill();
  GH.glow(g,x,y,70*s,"rgba(255,160,70,.9)",.55);
}
function mod(a,b){ return ((a%b)+b)%b; }

function drawStage(g,W,H){
  const s0=H/720, fy=S.fy||H*.8, cx=S.camX, t=S.t;
  let gr=g.createLinearGradient(0,0,0,fy);
  gr.addColorStop(0,"#0b0520"); gr.addColorStop(.4,"#31164f"); gr.addColorStop(.78,"#b24d78"); gr.addColorStop(1,"#ff9a6b");
  g.fillStyle=gr; g.fillRect(0,0,W,fy+2);
  for(let i=0;i<70;i++){
    const sx=mod(GH.hash(i)*W-cx*.03*s0,W), sy=GH.hash(i+90)*fy*.55;
    g.fillStyle=`rgba(255,255,255,${.35+.4*Math.sin(t*2+i)})`; g.fillRect(sx,sy,1.6,1.6);
  }
  // moon
  const mx=W*.72-cx*.02*s0, my=fy*.3, mr=H*.1;
  GH.glow(g,mx,my,mr*3.2,"rgba(255,225,200,.55)",.8);
  g.fillStyle="#fff1d8"; g.beginPath(); g.arc(mx,my,mr,0,7); g.fill();
  g.fillStyle="rgba(210,170,150,.35)"; [[-.3,-.2,.22],[.25,.15,.3],[-.1,.4,.15]].forEach(c=>{ g.beginPath(); g.arc(mx+c[0]*mr,my+c[1]*mr,c[2]*mr,0,7); g.fill(); });
  // layers
  mountains(g,W,fy,s0,.05,200,70,"#3b1e5e",1.3);
  mountains(g,W,fy,s0,.1,130,55,"#2a1448",4.1);
  for(let k=-1;k<4;k++){
    const wx=mod(k*1100-cx*.16,3300)-700;
    pagoda(g,W/2+wx*s0,fy-6*s0,s0*(k%2?.8:1),"#1b0e30");
  }
  mountains(g,W,fy,s0,.2,40,18,"#170a28",7.7);
  // temple wall + lanterns (parallax .45)
  const wallTop=fy-150*s0;
  g.fillStyle="#241036"; g.fillRect(0,wallTop,W,150*s0);
  g.fillStyle="#34184c"; g.fillRect(0,wallTop,W,10*s0);
  g.fillStyle="#150a24"; for(let i=0;i<W/(60*s0)+2;i++)g.fillRect(mod(i*60*s0-cx*.45*s0,W+60*s0)-30*s0,wallTop-14*s0,34*s0,14*s0);
  for(let k=-2;k<10;k++){
    const x=W/2+(mod(k*360-cx*.45,3600)-1000)*s0;
    g.fillStyle="#7d1d22"; g.fillRect(x-9*s0,wallTop-4*s0,18*s0,154*s0);
    g.fillStyle="#d4a63c"; g.fillRect(x-12*s0,wallTop-4*s0,24*s0,8*s0);
    lantern(g,x+44*s0,wallTop+54*s0+Math.sin(t*1.5+k)*2,s0*1.1);
  }
  // cherry trees (parallax .7)
  for(let k=-2;k<7;k++){
    const x=W/2+(mod(k*520-cx*.7,3640)-1300)*s0, base=fy-2*s0;
    g.strokeStyle="#2b1220"; g.lineWidth=14*s0; g.lineCap="round"; g.beginPath(); g.moveTo(x,base); g.quadraticCurveTo(x+20*s0,base-110*s0,x-8*s0,base-190*s0); g.stroke();
    g.lineWidth=7*s0; g.beginPath(); g.moveTo(x+6*s0,base-110*s0); g.lineTo(x+60*s0,base-170*s0); g.stroke();
    [[0,-210,70],[-50,-170,52],[56,-180,56],[24,-150,44],[-14,-250,46]].forEach((b,i)=>{
      g.fillStyle=i%2?"rgba(255,150,190,.8)":"rgba(255,185,212,.85)"; g.beginPath(); g.arc(x+b[0]*s0,base+b[1]*s0,b[2]*s0,0,7); g.fill();
    });
  }
  // floor
  gr=g.createLinearGradient(0,fy,0,H); gr.addColorStop(0,"#4a3558"); gr.addColorStop(.25,"#2a1d3a"); gr.addColorStop(1,"#120a1c");
  g.fillStyle=gr; g.fillRect(0,fy,W,H-fy);
  g.fillStyle="rgba(255,210,150,.25)"; g.fillRect(0,fy,W,3);
  g.strokeStyle="rgba(10,4,18,.55)"; g.lineWidth=2;
  for(let i=1;i<9;i++){ const y=fy+Math.pow(i/8,1.7)*(H-fy); g.beginPath(); g.moveTo(0,y); g.lineTo(W,y); g.stroke(); }
  for(let j=-24;j<=24;j++){
    const xt=W/2+(j*150-cx)*s0; g.beginPath(); g.moveTo(xt,fy); g.lineTo(W/2+(xt-W/2)*3.4,H); g.stroke();
  }
  // moon reflection
  const rg=g.createRadialGradient(W/2-cx*.0,fy+H*.08,10,W/2,fy+H*.08,W*.4);
  rg.addColorStop(0,"rgba(255,200,170,.18)"); rg.addColorStop(1,"rgba(0,0,0,0)");
  g.fillStyle=rg; g.fillRect(0,fy,W,H-fy);
}

function drawWorld(g,W,H){
  const s=S.s||H/720, fy=S.fy||H*.8;
  const sh=S.shake>0?S.shake:0;
  g.save();
  g.translate(W/2-S.camX*s+(Math.random()-.5)*sh,fy+(Math.random()-.5)*sh);
  g.scale(s,s);
  // shadows
  S.F.forEach(f=>{
    const k=Math.max(.35,1-f.y/400);
    g.fillStyle=`rgba(0,0,0,${.4*k})`; g.beginPath(); g.ellipse(f.x,6,50*k,10*k,0,0,7); g.fill();
  });
  // super darkening glow
  S.F.forEach(f=>{ if(f.st==="super")GH.glow(g,f.x,-100,260,f.def.accent,.5); });
  // fighters (sorted so active one is in front)
  [...S.F].sort((a,b)=>(a.hp>0?1:0)-(b.hp>0?1:0)||a.i-b.i).forEach(f=>{
    g.save(); g.translate(f.x,-f.y); g.scale(f.face,1);
    const P=poseFor(f,S.t);
    let k=0;
    if(f.st==="ko") k=Math.min(1,f.stT/.35);
    else if(f.st==="down") k=f.stT<.2?f.stT/.2:(f.stT>.7?Math.max(0,(.95-f.stT)/.25):1);
    else if(f.st==="getup") k=Math.max(0,1-f.stT/.3)*.5;
    if(f.st==="hit"&&f.launched&&f.y>0) k=.45;
    if(f.inv>0&&f.st!=="super"&&Math.floor(f.inv*20)%2)g.globalAlpha=.55;
    drawFighter(g,f.def,P,{t:S.t,k,aura:P.aura||f.cool>1.05&&false});
    if(f.frozen>0){
      g.globalAlpha=1; g.fillStyle="rgba(150,225,255,.5)"; g.beginPath(); g.roundRect(-36,-196,72,200,16); g.fill();
      g.strokeStyle="rgba(255,255,255,.8)"; g.lineWidth=2; g.beginPath(); g.moveTo(-20,-180); g.lineTo(10,-120); g.lineTo(-10,-60); g.moveTo(20,-170); g.lineTo(0,-100); g.stroke();
    }
    g.restore();
    if(f.dot>0){ g.fillStyle=f.dotK===1?"rgba(255,140,40,.8)":"rgba(160,255,60,.7)"; for(let i=0;i<3;i++){ g.beginPath(); g.arc(f.x+Math.sin(S.t*9+i*2)*18,-f.y-30-((S.t*90+i*50)%150),4,0,7); g.fill(); } }
  });
  // projectiles
  S.proj.forEach(p=>drawProj(g,p));
  // lightning strikes
  S.strikes.forEach(st=>{
    const k=1-st.t/st.m;
    g.strokeStyle=`rgba(143,216,255,${.3+.5*k})`; g.lineWidth=4; g.setLineDash([10,8]); g.beginPath(); g.arc(st.x,0,90*(1-k*.3),0,7); g.stroke(); g.setLineDash([]);
    GH.glow(g,st.x,0,100,"#8fd8ff",.4*k);
  });
  // fx
  S.fx.forEach(f=>{
    const k=f.t/f.m;
    if(f.k==="hit"){ g.save(); g.translate(f.x,f.y); g.rotate(f.m*20); GH.drawStar(g,0,0,38*(1.2-k*.4),"#fff"); GH.drawStar(g,0,0,24*(1.2-k*.4),f.c||"#ffd23f"); g.restore(); GH.glow(g,f.x,f.y,70,f.c||"#ffd23f",k); }
    else if(f.k==="block"){ g.strokeStyle=`rgba(124,231,255,${k})`; g.lineWidth=5; g.beginPath(); g.arc(f.x,f.y,30*(2-k),0,7); g.stroke(); }
    else if(f.k==="ring"){ g.strokeStyle=f.c; g.globalAlpha=k; g.lineWidth=10*k; g.beginPath(); g.arc(f.x,f.y,(1-k)*520+30,0,7); g.stroke(); g.globalAlpha=1; }
    else if(f.k==="bolt"){
      g.strokeStyle="#fff"; g.lineWidth=10*k+3; g.lineJoin="round"; g.beginPath(); g.moveTo(f.x,-700);
      for(let i=1;i<=8;i++)g.lineTo(f.x+(Math.random()-.5)*60,-700+i*88); g.stroke();
      GH.glow(g,f.x,-120,200,"#8fd8ff",k);
    }
  });
  GH.drawParticles(g,S.parts);
  // stage pillars (foreground)
  [-STAGE-30,STAGE+30].forEach(px=>{
    let gr=g.createLinearGradient(px-34,0,px+34,0); gr.addColorStop(0,"#5a1519"); gr.addColorStop(.5,"#b52a2e"); gr.addColorStop(1,"#4a1013");
    g.fillStyle=gr; g.fillRect(px-34,-760,68,790);
    g.fillStyle="#d4a63c"; g.fillRect(px-44,-760,88,22); g.fillRect(px-42,-40,84,40);
    g.fillStyle="rgba(0,0,0,.35)"; g.fillRect(px-34,-760,68,790);
    g.fillStyle=gr; g.fillRect(px-34,-760,68,790);
  });
  g.restore();
  // petals
  g.fillStyle="rgba(255,190,215,.85)";
  S.petals.forEach(q=>{ const x=W/2+(q.x-S.camX*.9)*s, y=q.y/720*H; g.beginPath(); g.ellipse(mod(x,W),y,q.r*s*1.5,q.r*s*.8,q.ph,0,7); g.fill(); });
}

function drawProj(g,p){
  const x=p.x,y=-p.y,d=Math.sign(p.vx)||1,t=S.t;
  g.save(); g.translate(x,y);
  if(p.k==="ice"){
    GH.glow(g,0,0,70,"#6fe0ff",.9);
    g.fillStyle="#d8f6ff"; g.strokeStyle="#6fe0ff"; g.lineWidth=3; g.beginPath(); g.moveTo(d*38,0); g.lineTo(0,-16); g.lineTo(-d*26,0); g.lineTo(0,16); g.closePath(); g.fill(); g.stroke();
  } else if(p.k==="fire"){
    const r=p.r*(1+Math.sin(t*30)*.08); GH.glow(g,0,0,r*3,"#ff7a1a",.9);
    g.fillStyle="#ff6a00"; g.beginPath(); g.arc(0,0,r*.8,0,7); g.fill();
    g.fillStyle="#ffd23f"; g.beginPath(); g.arc(d*4,0,r*.5,0,7); g.fill();
    g.fillStyle="#fff7cf"; g.beginPath(); g.arc(d*8,0,r*.25,0,7); g.fill();
    g.fillStyle="rgba(255,106,0,.6)"; g.beginPath(); g.moveTo(-d*r*2.4,0); g.lineTo(-d*r*.4,-r*.7); g.lineTo(-d*r*.4,r*.7); g.fill();
  } else if(p.k==="bolt"){
    GH.glow(g,0,0,90,"#8fd8ff",.8); g.strokeStyle="#fff"; g.lineWidth=7; g.lineJoin="round"; g.beginPath(); g.moveTo(-d*60,0);
    for(let i=1;i<=6;i++)g.lineTo(-d*60+d*i*20,(Math.random()-.5)*34); g.stroke();
    g.strokeStyle="#8fd8ff"; g.lineWidth=3; g.stroke();
  } else if(p.k==="poison"){
    GH.glow(g,0,0,80,"#b6ff3a",.7); g.fillStyle="#6fd12a"; g.beginPath(); g.arc(0,0,p.r*.7,0,7); g.fill();
    g.fillStyle="#c9ff6a"; for(let i=0;i<4;i++){ g.beginPath(); g.arc(Math.sin(t*8+i*2)*14,Math.cos(t*7+i*3)*12,5,0,7); g.fill(); }
  } else if(p.k==="fan"){
    g.rotate(t*22*d); GH.glow(g,0,0,70,"#ffd1e6",.6);
    for(let i=0;i<5;i++){ g.rotate(Math.PI*2/5); g.fillStyle=i%2?"#d9487a":"#2c5ec2"; g.strokeStyle="#fff"; g.lineWidth=1.5; g.beginPath(); g.moveTo(0,0); g.lineTo(34,-14); g.quadraticCurveTo(40,0,34,14); g.closePath(); g.fill(); g.stroke(); }
  } else { // quake
    const w=p.r;
    GH.glow(g,0,-10,w*2,"#ffcf5a",.5);
    g.fillStyle="#7a2626"; g.strokeStyle="#ffcf5a"; g.lineWidth=3;
    for(let i=-1;i<=1;i++){ g.beginPath(); g.moveTo(i*w*.6-14,0); g.lineTo(i*w*.6,-w*(1.1-Math.abs(i)*.3)); g.lineTo(i*w*.6+14,0); g.closePath(); g.fill(); g.stroke(); }
  }
  g.restore();
}

/* ------------ HUD ------------ */

function bar(g,x,y,w,h,f,mirror){
  const pct=Math.max(0,f.hp/f.max), gp=Math.max(0,f.ghost/f.max);
  g.save();
  g.fillStyle="rgba(8,4,16,.8)"; g.beginPath(); g.roundRect(x-4,y-4,w+8,h+8,8); g.fill();
  const fillRect=(p,c)=>{ const ww=w*p; g.fillStyle=c; g.beginPath(); g.roundRect(mirror?x+w-ww:x,y,ww,h,5); g.fill(); };
  fillRect(1,"#2a1a3a");
  fillRect(gp,"#ffe08a");
  const col=pct>.5?"#41e08a":pct>.25?"#ffc43d":"#ff4d4d";
  const gr=g.createLinearGradient(0,y,0,y+h); gr.addColorStop(0,"#fff9"); gr.addColorStop(.25,col); gr.addColorStop(1,col);
  { const ww=w*pct; g.fillStyle=gr; g.beginPath(); g.roundRect(mirror?x+w-ww:x,y,ww,h,5); g.fill(); }
  g.strokeStyle="#d4a63c"; g.lineWidth=2.5; g.beginPath(); g.roundRect(x-4,y-4,w+8,h+8,8); g.stroke();
  // name + pips
  g.font=`700 ${Math.max(15,h*.85)}px Fredoka,sans-serif`; g.textBaseline="bottom"; g.textAlign=mirror?"right":"left";
  g.fillStyle=f.c; g.fillText(`${f.name} · ${f.def.name}`,mirror?x+w:x,y-9);
  for(let i=0;i<2;i++){ const px=mirror?x+w-i*20-8:x+i*20+8; g.fillStyle=i<f.wins?"#ffd23f":"#3a2a4a"; g.strokeStyle="#d4a63c"; g.lineWidth=2; g.beginPath(); g.arc(px,y+h+20,7,0,7); g.fill(); g.stroke(); }
  // meter
  const mw=w*.62, mh=Math.max(8,h*.4), my=y+h+9, mx=mirror?x+w-mw-50:x+50;
  g.fillStyle="rgba(8,4,16,.8)"; g.beginPath(); g.roundRect(mx,my,mw,mh,4); g.fill();
  const full=f.meter>=100;
  g.fillStyle=full?`hsl(${(S.t*300)%360},90%,62%)`:"#46c8ff"; g.beginPath(); g.roundRect(mirror?mx+mw-mw*f.meter/100:mx,my,mw*f.meter/100,mh,4); g.fill();
  g.strokeStyle="#8fd8ff"; g.lineWidth=1.5; g.beginPath(); g.roundRect(mx,my,mw,mh,4); g.stroke();
  if(full){ g.font="700 12px Fredoka,sans-serif"; g.textBaseline="middle"; g.textAlign="center"; g.fillStyle="#fff"; g.fillText("SUPER READY · R1",mx+mw/2,my+mh/2+1); }
  g.restore();
}

function drawHUD(g,W,H){
  const n=S.F.length, pad=18;
  if(n===2){
    const w=Math.min(W*.38,520), h=Math.max(20,H*.034);
    bar(g,pad+4,H*.075,w,h,S.F[0],false);
    bar(g,W-pad-4-w,H*.075,w,h,S.F[1],true);
  } else {
    const w=Math.min(W/n-30,360), h=Math.max(14,H*.024);
    S.F.forEach((f,i)=>bar(g,(W/n)*i+(W/n-w)/2,H*.085,w,h,f,false));
  }
  // timer
  const tx=W/2, ty=H*.07, r=Math.max(30,H*.05);
  g.save();
  g.fillStyle="rgba(8,4,16,.85)"; g.beginPath(); g.arc(tx,ty,r,0,7); g.fill();
  g.strokeStyle="#d4a63c"; g.lineWidth=4; g.stroke();
  g.font=`700 ${r*.95}px Fredoka,sans-serif`; g.textAlign="center"; g.textBaseline="middle"; g.fillStyle=S.rt<10?"#ff5d5d":"#fff";
  g.fillText(Math.max(0,Math.ceil(S.rt)),tx,ty+2);
  g.restore();
  // combos
  const s=S.s;
  S.F.forEach(f=>{
    if(f.combo>=2&&f.comboT>0){
      const sx=W/2+(f.x-S.camX)*s, sy=S.fy-(f.y+250)*s;
      GH.bigText(g,`${f.combo} HITS`,sx,sy,Math.max(22,H*.04),"#fff",f.c,1+Math.min(.3,f.comboT*.2),Math.min(1,f.comboT*2));
    }
  });
}

function drawAnnouncer(g,W,H){
  const sz=Math.min(W*.12,H*.17);
  const pop=k=>1+Math.max(0,1-k*5)*.5;
  if(S.phase==="intro"){
    if(S.pt<1.1) GH.bigText(g,`ROUND ${S.round}`,W/2,H*.4,sz,"#fff","#ffb703",pop(S.pt%1.1),1);
    else if(S.pt<2.1) GH.bigText(g,"FIGHT!",W/2,H*.4,sz*1.25,"#fff4b0","#ff4d2e",pop(S.pt-1.1),1);
  } else if(S.phase==="roundend"){
    const ko=S.F.some(f=>f.hp<=0);
    if(S.pt<1.5) GH.bigText(g,ko?"K.O.":"TIME UP",W/2,H*.4,sz*1.4,"#fff","#ff3b3b",pop(S.pt),1);
    else if(S.winner) GH.bigText(g,`${S.winner.name} WINS`,W/2,H*.4,sz*.8,"#fff",S.winner.c,pop(S.pt-1.5),1);
    else GH.bigText(g,"DRAW",W/2,H*.4,sz,"#fff","#aaa",1,1);
  } else if(S.phase==="matchend"&&S.winner){
    GH.bigText(g,`${S.winner.def.name}`,W/2,H*.3,sz*.7,"#fff",S.winner.def.accent,1,1);
    GH.bigText(g,"VICTORY",W/2,H*.45,sz*1.3,"#fff4b0","#ff9f1c",pop(S.pt),1);
    GH.bigText(g,S.winner.name,W/2,H*.6,sz*.5,"#fff",S.winner.c,1,1);
  }
}

/* ------------ select & versus screens ------------ */

function menuBG(g,W,H,c1,c2){
  const gr=g.createLinearGradient(0,0,W,H); gr.addColorStop(0,c1); gr.addColorStop(1,c2);
  g.fillStyle=gr; g.fillRect(0,0,W,H);
  g.save(); g.globalAlpha=.07; g.fillStyle="#fff";
  for(let i=0;i<9;i++){ const x=((i*260+S.t*40)%(W+400))-200; g.beginPath(); g.moveTo(x,0); g.lineTo(x+90,0); g.lineTo(x-160,H); g.lineTo(x-250,H); g.fill(); }
  g.restore();
}

function drawSelect(g,W,H,P){
  menuBG(g,W,H,"#0b0618","#2b1245");
  GH.bigText(g,"CHOOSE YOUR FIGHTER",W/2,H*.085,Math.min(W*.05,H*.075),"#fff","#ffb703",1,1);
  const n=FIGHTERS.length, gap=Math.max(8,W*.01);
  const cw=Math.min(200,(W-60-gap*(n-1))/n), ch=Math.min(cw*1.5,H*.5);
  const x0=(W-(n*cw+(n-1)*gap))/2, y0=H*.16;
  FIGHTERS.forEach((d,i)=>{
    const x=x0+i*(cw+gap), y=y0;
    const on=P.filter(p=>p.cs===i);
    g.save();
    g.beginPath(); g.roundRect(x,y,cw,ch,14); g.clip();
    const gr=g.createLinearGradient(x,y,x,y+ch); gr.addColorStop(0,d.c1+"66"); gr.addColorStop(1,"#120a1e");
    g.fillStyle="#150c24"; g.fillRect(x,y,cw,ch); g.fillStyle=gr; g.fillRect(x,y,cw,ch);
    GH.glow(g,x+cw/2,y+ch*.55,cw*.8,d.accent,on.length?.45:.16);
    const sc=ch*.62/200;
    g.save(); g.translate(x+cw/2,y+ch*.84); g.scale(sc,sc);
    const dm=dummy(d); dm.ph=i;
    g.fillStyle="rgba(0,0,0,.4)"; g.beginPath(); g.ellipse(0,4,46,9,0,0,7); g.fill();
    drawFighter(g,d,poseFor(dm,S.t+i),{t:S.t});
    g.restore();
    g.fillStyle="rgba(8,4,16,.75)"; g.fillRect(x,y+ch-ch*.17,cw,ch*.17);
    g.restore();
    g.textAlign="center"; g.textBaseline="middle";
    g.font=`700 ${Math.max(14,cw*.11)}px Fredoka,sans-serif`; g.fillStyle="#fff"; g.fillText(d.name,x+cw/2,y+ch-ch*.1);
    g.font=`600 ${Math.max(10,cw*.065)}px Fredoka,sans-serif`; g.fillStyle=d.accent; g.fillText(d.title,x+cw/2,y+ch-ch*.04);
    g.lineWidth=on.length?5:2; g.strokeStyle=on.length?on[0].c:"rgba(255,255,255,.18)";
    g.beginPath(); g.roundRect(x,y,cw,ch,14); g.stroke();
    on.forEach((p,k)=>{
      const tw=cw/Math.max(2,on.length)-4, tx=x+2+k*(tw+4);
      g.fillStyle=p.c; g.beginPath(); g.roundRect(tx,y-26,tw,22,6); g.fill();
      g.fillStyle="#14091f"; g.font="700 13px Fredoka,sans-serif"; g.fillText(`${p.locked?"✔ ":""}P${p.n}`,tx+tw/2,y-14);
    });
  });
  // detail panel for each player's hovered fighter (first player large)
  const p0=P[0]; if(!p0)return;
  const d=FIGHTERS[p0.cs], py=y0+ch+Math.max(18,H*.035), pw=Math.min(W-60,900), px=(W-pw)/2, ph=Math.min(H-py-16,170);
  g.fillStyle="rgba(10,5,20,.8)"; g.beginPath(); g.roundRect(px,py,pw,ph,16); g.fill();
  g.strokeStyle=d.accent; g.lineWidth=2; g.stroke();
  g.textAlign="left"; g.textBaseline="middle";
  g.font="700 28px Fredoka,sans-serif"; g.fillStyle="#fff"; g.fillText(d.name,px+22,py+30);
  g.font="600 15px Fredoka,sans-serif"; g.fillStyle=d.accent; g.fillText(d.title,px+22,py+56);
  g.fillStyle="#cfc6e4"; g.font="500 14px Fredoka,sans-serif"; g.fillText(d.blurb,px+22,py+82);
  g.fillStyle="#fff"; g.font="600 14px Fredoka,sans-serif";
  g.fillText(`Y  ${d.special}     R1  ${d.sup} (needs full super bar)`,px+22,py+110);
  g.fillStyle="#9d93bd"; g.fillText("A punch   B kick   X block   Stick up jump / down crouch   Crouch+A uppercut   Crouch+B sweep",px+22,py+136);
  const stats=[["POWER",d.pow/1.2],["SPEED",d.spd/1.2],["HEALTH",d.hp/125]];
  stats.forEach((s,i)=>{
    const sx=px+pw-250, sy=py+26+i*30;
    g.fillStyle="#cfc6e4"; g.font="700 12px Fredoka,sans-serif"; g.fillText(s[0],sx,sy);
    g.fillStyle="#2a1a3a"; g.fillRect(sx+70,sy-6,150,12);
    g.fillStyle=d.accent; g.fillRect(sx+70,sy-6,150*Math.min(1,s[1]),12);
  });
  g.textAlign="center"; g.font="600 15px Fredoka,sans-serif"; g.fillStyle="#bdb3dc";
  g.fillText("Stick left / right to choose   ·   A to lock in   ·   B to change",W/2,H-14);
}

function drawVersus(g,W,H){
  menuBG(g,W,H,"#2a0a18","#0a1034");
  const n=S.F.length, k=Math.min(1,S.pt/.4);
  g.save(); g.globalAlpha=.9; g.fillStyle="rgba(0,0,0,.35)"; g.beginPath(); g.moveTo(W*.55,0); g.lineTo(W*.45,H); g.lineTo(W,H); g.lineTo(W,0); g.fill(); g.restore();
  const sc=Math.min(H/300,W/(n*260)*1.2);
  S.F.forEach((f,i)=>{
    const slot=(i+.5)/n, side=n===2?(i===0?-1:1):0;
    const x=W*slot+side*(1-k)*-W*.5+(n===2?0:0), y=H*.78;
    g.save(); g.translate(x,y); g.scale(sc*(n===2?(i===0?1:-1):1),sc);
    GH.glow(g,0,-100,200,f.def.accent,.5);
    drawFighter(g,f.def,poseFor(dummy(f.def),S.t),{t:S.t});
    g.restore();
    GH.bigText(g,f.def.name,x,H*.2,Math.min(W*.05,H*.08),"#fff",f.def.accent,1,k);
    GH.bigText(g,f.name,x,H*.29,Math.min(W*.025,H*.04),"#fff",f.c,1,k);
  });
  if(n===2) GH.bigText(g,"VS",W/2,H*.5,Math.min(W*.14,H*.25),"#fff4b0","#ff3b3b",1+Math.max(0,1-S.pt*3)*.6,1);
}

}

/* =========================================================
   SUPER PLUMBER  -  side-scrolling platformer, World 1
========================================================= */

function makePlatformer(){

const T=40, ROWS=15, COLS=236, GR=13;
const SOLID=new Set(["G","D","B","?","M","U","X","a","b","c","d"]);
const S={};
let level=[];
const PITS=[[62,2],[78,3],[112,2],[146,3],[171,2]];
const inPit=c=>PITS.some(([a,w])=>c>=a&&c<a+w);

function build(){
  level=Array.from({length:ROWS},()=>Array(COLS).fill(" "));
  const put=(c,r,ch)=>{ if(c>=0&&c<COLS&&r>=0&&r<ROWS)level[r][c]=ch; };
  const row=(c,r,s)=>[...s].forEach((ch,i)=>put(c+i,r,ch));
  for(let c=0;c<COLS;c++){ if(inPit(c))continue; put(c,13,"G"); put(c,14,"D"); }
  const pipe=(c,h)=>{ put(c,GR-h,"a"); put(c+1,GR-h,"b"); for(let r=GR-h+1;r<GR;r++){ put(c,r,"c"); put(c+1,r,"d"); } };
  [[26,2],[36,3],[44,4],[55,4],[96,2],[104,3],[128,3],[139,4],[160,2]].forEach(([c,h])=>pipe(c,h));
  const stair=(c,h,up)=>{ for(let i=0;i<h;i++)for(let j=0;j<=i;j++)put(up?c+i:c+h-1-i,GR-1-j,"X"); };
  const coins=(c,r,n)=>{ for(let i=0;i<n;i++)put(c+i,r-Math.round(Math.sin(i/(n-1)*Math.PI)*1.5),"o"); };
  put(12,9,"?"); row(17,9,"BMB"); put(18,5,"?"); row(30,9,"B?B");
  coins(32,6,5); row(48,9,"B?BBB?B"); put(51,5,"M");
  coins(58,8,6); row(66,9,"?"); row(68,6,"BBB?B"); coins(70,4,4);
  stair(74,4,true); stair(84,4,false);
  row(80,8,"BBBB"); put(82,4,"?"); coins(88,9,5);
  row(92,9,"B?B"); row(98,6,"?BBB"); coins(100,3,5);
  row(106,9,"BBB"); put(108,9,"?"); row(118,9,"B?BMB"); coins(120,5,6);
  stair(108,4,true); coins(116,8,4);
  row(130,9,"BBBBB"); row(133,5,"?B?"); coins(136,9,5);
  row(142,9,"B?B"); stair(143,4,true); stair(151,4,false); coins(146,8,4);
  row(152,8,"?BB?"); coins(158,8,5); row(164,9,"BMB"); coins(166,5,5);
  row(176,9,"?B?B?"); coins(178,5,6);
  row(190,9,"BBB"); stair(188,8,true); // final staircase
  put(198,GR-1,"X"); // flag base
  S.flagC=198;
  // enemies
  S.enemies=[];
  [22,32,40,41,50,52,64,70,82,90,94,100,109,118,124,132,134,148,154,158,164,174,178,184].forEach(c=>{
    if(inPit(c)||level[GR][c]!=="G"||level[GR-1][c]!==" "||level[GR-1][c+1]!==" ")return;
    S.enemies.push({x:c*T+T/2,y:GR*T,vx:-60,vy:0,w:30,h:30,dead:0,flip:false,ph:Math.random()*6,active:false,kind:Math.random()<.2?"spiny":"grunt"});
  });
}

const solidAt=(c,r)=>{
  if(c<0||c>=COLS)return true;
  if(r<0||r>=ROWS)return false;
  return SOLID.has(level[r][c]);
};

function moveBox(e,dx,dy){
  const res={x:false,gy:false,hy:false,bc:-1,br:-1};
  e.x+=dx;
  let top=e.y-e.h, bot=e.y;
  if(dx!==0){
    const c=dx>0?Math.floor((e.x+e.w/2)/T):Math.floor((e.x-e.w/2)/T);
    for(let r=Math.floor(top/T);r<=Math.floor((bot-1)/T);r++){
      if(solidAt(c,r)){ e.x=dx>0?c*T-e.w/2-.01:(c+1)*T+e.w/2+.01; res.x=true; break; }
    }
  }
  e.y+=dy; top=e.y-e.h; bot=e.y;
  const c0=Math.floor((e.x-e.w/2+1)/T), c1=Math.floor((e.x+e.w/2-1)/T);
  if(dy>0){
    const r=Math.floor(bot/T);
    for(let c=c0;c<=c1;c++){ if(solidAt(c,r)&&bot-dy<=r*T+1){ e.y=r*T; res.gy=true; break; } }
  } else if(dy<0){
    const r=Math.floor(top/T); let best=-1,bd=1e9;
    for(let c=c0;c<=c1;c++){ if(solidAt(c,r)){ const d=Math.abs((c+.5)*T-e.x); if(d<bd){bd=d;best=c;} } }
    if(best>=0){ e.y=(r+1)*T+e.h+.01; res.hy=true; res.bc=best; res.br=r; }
  }
  return res;
}

function pop(x,y,txt,c="#fff"){ S.pops.push({x,y,t:1,txt,c}); }

function bump(c,r,p){
  const ch=level[r]?.[c];
  S.bumps[c+","+r]=.18;
  const cx=c*T+T/2;
  if(ch==="?"){
    level[r][c]="U"; p.coins++; p.score+=20; Sfx.play("point");
    S.coinFx.push({x:cx,y:r*T,vy:-520,t:.7}); pop(cx,r*T-10,"+20","#ffe46a");
  } else if(ch==="M"){
    level[r][c]="U"; Sfx.play("join");
    S.items.push({x:cx,y:r*T+T,vx:0,vy:0,w:30,h:30,emerge:0,by:r*T,ph:0});
  } else if(ch==="B"){
    if(p.big){
      level[r][c]=" "; p.score+=50; Sfx.play("hit");
      for(let i=0;i<4;i++)S.debris.push({x:cx+(i%2?10:-10),y:r*T+(i<2?8:28),vx:(i%2?1:-1)*GH.random(60,160),vy:GH.random(-520,-300),rot:0});
    }
  }
  // enemies standing on the block get flipped
  S.enemies.forEach(e=>{
    if(!e.dead&&Math.abs(e.x-cx)<T*.7&&Math.abs(e.y-r*T)<6){ e.dead=2; e.vy=-380; e.flip=true; p.score+=100; pop(e.x,e.y-30,"100"); }
  });
}

function hurt(p){
  if(p.inv>0||p.dead)return;
  if(p.big){ p.big=false; p.h=34; p.inv=2; Sfx.play("out"); return; }
  kill(p);
}
function kill(p){
  if(p.dead)return;
  p.dead=true; p.deadT=0; p.vy=-760; p.vx=0; p.big=false; p.h=34; p.score=Math.max(0,p.score-50); p.lives--;
  Sfx.play("out");
}

function respawn(p){
  p.dead=false;
  let c=Math.max(Math.floor((S.cam+90)/T),Math.floor(p.safeX/T)-3);
  while(inPit(c)||level[GR][c]!=="G"||level[GR-1][c]!==" ")c++;
  p.x=c*T+T/2; p.y=GR*T-T*3; p.vx=0; p.vy=0; p.inv=2.2; p.h=34; p.big=false;
}

function groundCol(c){ return level[GR][c]==="G"; }

/* ------------ sprites ------------ */

function drawPlumber(g,p,x,y,t){
  const big=p.big, sc=big?1:.56;
  const ground=p.ground, moving=Math.abs(p.vx)>20;
  const ph=t*Math.max(8,Math.abs(p.vx)*.04);
  g.save(); g.translate(x,y); g.scale(p.face*sc,sc);
  const dk="#1a0f12", over="#2b5fc9", skin="#f5c49a", cap=p.c;
  const bob=moving&&ground?Math.abs(Math.sin(ph))*2:0;
  g.lineCap="round"; g.lineJoin="round";
  // legs
  const lA=moving&&ground?Math.sin(ph)*9:(ground?0:6), lB=-lA;
  const shoe=(sx,sy)=>{ g.fillStyle=dk; g.beginPath(); g.ellipse(sx+4,sy-4,13,8,0,0,7); g.fill(); g.fillStyle="#7a3b16"; g.beginPath(); g.ellipse(sx+4,sy-5,11,6.5,0,0,7); g.fill(); };
  g.strokeStyle=dk; g.lineWidth=13; g.beginPath(); g.moveTo(-5,-22); g.lineTo(-5+lB*.4,-8); g.moveTo(7,-22); g.lineTo(7+lA*.4,-8); g.stroke();
  g.strokeStyle=over; g.lineWidth=9; g.beginPath(); g.moveTo(-5,-22); g.lineTo(-5+lB*.4,-8); g.moveTo(7,-22); g.lineTo(7+lA*.4,-8); g.stroke();
  shoe(-6+lB,0); shoe(6+lA,0);
  // body
  g.fillStyle=dk; g.beginPath(); g.roundRect(-15,-50-bob,30,34,9); g.fill();
  g.fillStyle=cap; g.beginPath(); g.roundRect(-13,-48-bob,26,30,8); g.fill();
  g.fillStyle=over; g.beginPath(); g.roundRect(-12,-34-bob,24,19,6); g.fill();
  g.fillStyle=over; g.fillRect(-9,-48-bob,5,16); g.fillRect(4,-48-bob,5,16);
  g.fillStyle="#ffd83d"; g.beginPath(); g.arc(-6.5,-33-bob,2.6,0,7); g.arc(6.5,-33-bob,2.6,0,7); g.fill();
  // arms
  const up=!ground||p.dead||p.fin;
  g.strokeStyle=dk; g.lineWidth=12;
  const aY=up?-62:-38, aX=up?20:14+Math.sin(ph)*5;
  g.beginPath(); g.moveTo(8,-42-bob); g.lineTo(aX+6,aY-bob); g.stroke();
  g.strokeStyle=cap; g.lineWidth=8; g.beginPath(); g.moveTo(8,-42-bob); g.lineTo(aX+4,aY-bob); g.stroke();
  g.fillStyle="#fff"; g.beginPath(); g.arc(aX+6,aY-bob,6.5,0,7); g.fill(); g.strokeStyle=dk; g.lineWidth=2; g.stroke();
  // head
  g.fillStyle=dk; g.beginPath(); g.arc(2,-64-bob,17,0,7); g.fill();
  g.fillStyle=skin; g.beginPath(); g.arc(2,-64-bob,15,0,7); g.fill();
  g.fillStyle=skin; g.beginPath(); g.arc(14,-60-bob,6.5,0,7); g.fill(); // nose
  g.fillStyle="#4a2a14"; g.beginPath(); g.ellipse(8,-54-bob,10,4,0,0,7); g.fill(); // moustache
  g.fillStyle="#fff"; g.beginPath(); g.ellipse(9,-68-bob,4.3,5.6,0,0,7); g.fill();
  g.fillStyle="#1a1020"; g.beginPath(); g.arc(10.5,-68-bob,2.2,0,7); g.fill();
  g.fillStyle="#4a2a14"; g.beginPath(); g.ellipse(-10,-62-bob,6,8,0,0,7); g.fill(); // sideburn
  // cap
  g.fillStyle=dk; g.beginPath(); g.arc(1,-71-bob,17,Math.PI,0); g.lineTo(26,-69-bob); g.lineTo(22,-64-bob); g.lineTo(-16,-66-bob); g.fill();
  g.fillStyle=cap; g.beginPath(); g.arc(1,-71-bob,15,Math.PI,0); g.lineTo(24,-70-bob); g.lineTo(21,-66-bob); g.lineTo(-14,-67-bob); g.fill();
  g.fillStyle="#fff"; g.beginPath(); g.arc(4,-78-bob,6.5,0,7); g.fill();
  g.save(); g.scale(p.face,1); g.restore();
  g.restore();
  // initial on cap
  g.save(); g.translate(x,y); g.font=`700 ${Math.round(9*sc*1.5)}px Fredoka,sans-serif`; g.textAlign="center"; g.textBaseline="middle"; g.fillStyle=cap;
  g.restore();
}

function drawGrunt(g,e,x,y,t){
  g.save(); g.translate(x,y);
  if(e.flip)g.scale(1,-1);
  const sq=e.dead===1?.35:1; g.scale(1,sq);
  const w=Math.sin(t*10+e.ph)*4;
  if(e.kind==="spiny"){
    g.fillStyle="#d22b2b"; g.beginPath(); g.ellipse(0,-15,17,15,0,Math.PI,0); g.fill();
    g.fillStyle="#fff"; for(let i=-1;i<=1;i++){ g.beginPath(); g.moveTo(i*10-5,-22); g.lineTo(i*10,-37); g.lineTo(i*10+5,-22); g.fill(); }
    g.fillStyle="#f6d6a2"; g.beginPath(); g.ellipse(0,-9,15,9,0,0,Math.PI); g.fill();
  } else {
    g.fillStyle="#6d3a17"; g.beginPath(); g.moveTo(-16,-14); g.quadraticCurveTo(-18,-34,0,-34); g.quadraticCurveTo(18,-34,16,-14); g.quadraticCurveTo(0,-8,-16,-14); g.fill();
    g.fillStyle="#f6d6a2"; g.beginPath(); g.roundRect(-10,-16,20,10,4); g.fill();
    g.fillStyle="#fff"; g.beginPath(); g.ellipse(-6,-22,4.5,6,0,0,7); g.ellipse(6,-22,4.5,6,0,0,7); g.fill();
    g.fillStyle="#111"; g.beginPath(); g.arc(-5,-21,2,0,7); g.arc(5,-21,2,0,7); g.fill();
    g.strokeStyle="#2b1408"; g.lineWidth=2.5; g.beginPath(); g.moveTo(-12,-30); g.lineTo(-2,-25); g.moveTo(12,-30); g.lineTo(2,-25); g.stroke();
  }
  g.fillStyle="#2b1408"; g.beginPath(); g.ellipse(-8+w,-3,9,5,0,0,7); g.ellipse(8-w,-3,9,5,0,0,7); g.fill();
  g.restore();
}

function drawMush(g,x,y){
  g.save(); g.translate(x,y);
  g.fillStyle="#fff3d6"; g.beginPath(); g.roundRect(-9,-14,18,14,5); g.fill();
  g.fillStyle="#e83a3a"; g.beginPath(); g.moveTo(-17,-12); g.bezierCurveTo(-17,-34,17,-34,17,-12); g.closePath(); g.fill();
  g.fillStyle="#fff"; g.beginPath(); g.arc(-8,-22,4.5,0,7); g.arc(8,-22,4.5,0,7); g.arc(0,-29,3.5,0,7); g.fill();
  g.fillStyle="#111"; g.beginPath(); g.arc(-3.5,-8,1.6,0,7); g.arc(3.5,-8,1.6,0,7); g.fill();
  g.restore();
}

function drawTile(g,ch,x,y,t,c,r){
  if(ch==="G"||ch==="D"){
    g.fillStyle="#c9782b"; g.fillRect(x,y,T,T);
    g.fillStyle="#8a4a14"; g.fillRect(x,y+T-3,T,3); g.fillRect(x+T-3,y,3,T);
    g.fillStyle="#e6a04e"; g.fillRect(x,y,T,3);
    g.fillStyle="rgba(90,45,10,.35)"; g.fillRect(x+8,y+14,8,6); g.fillRect(x+24,y+26,8,6);
    if(ch==="G"){ g.fillStyle="#3fae3b"; g.fillRect(x,y,T,11); g.fillStyle="#6ed860"; g.fillRect(x,y,T,4); g.fillStyle="#2c8a2e";
      for(let i=0;i<5;i++){ g.beginPath(); g.moveTo(x+i*8,y+11); g.lineTo(x+i*8+4,y+17); g.lineTo(x+i*8+8,y+11); g.fill(); } }
  } else if(ch==="B"){
    g.fillStyle="#b5521f"; g.fillRect(x,y,T,T); g.fillStyle="#3b1608";
    g.fillRect(x,y+T/2-1,T,2); g.fillRect(x,y,T,2); g.fillRect(x,y+T-2,T,2);
    g.fillRect(x+T/2-1,y,2,T/2); g.fillRect(x+T/4-1,y+T/2,2,T/2); g.fillRect(x+T*.75-1,y+T/2,2,T/2);
    g.fillStyle="rgba(255,200,140,.35)"; g.fillRect(x+2,y+2,T/2-4,3); g.fillRect(x+4,y+T/2+2,T/4-5,3);
  } else if(ch==="?"||ch==="M"){
    const sh=(Math.sin(t*4+c*.5)+1)/2;
    g.fillStyle="#6b3a0a"; g.fillRect(x,y,T,T);
    g.fillStyle=`hsl(${40+sh*6},96%,${54+sh*8}%)`; g.fillRect(x+2,y+2,T-4,T-4);
    g.fillStyle="#ffe58a"; g.fillRect(x+2,y+2,T-4,3); g.fillRect(x+2,y+2,3,T-4);
    g.fillStyle="#b86a0e"; g.fillRect(x+2,y+T-5,T-4,3); g.fillRect(x+T-5,y+2,3,T-4);
    g.fillStyle="#6b3a0a"; [[5,5],[T-8,5],[5,T-8],[T-8,T-8]].forEach(q=>g.fillRect(x+q[0],y+q[1],3,3));
    g.font="700 26px Fredoka,sans-serif"; g.textAlign="center"; g.textBaseline="middle";
    g.fillStyle="#6b3a0a"; g.fillText("?",x+T/2+1,y+T/2+3); g.fillStyle="#fff7d1"; g.fillText("?",x+T/2,y+T/2+1);
  } else if(ch==="U"){
    g.fillStyle="#3b2412"; g.fillRect(x,y,T,T); g.fillStyle="#8a5a33"; g.fillRect(x+2,y+2,T-4,T-4);
    g.fillStyle="#6a4222"; g.fillRect(x+2,y+T-5,T-4,3); g.fillRect(x+T-5,y+2,3,T-4);
    g.fillStyle="#3b2412"; [[5,5],[T-8,5],[5,T-8],[T-8,T-8]].forEach(q=>g.fillRect(x+q[0],y+q[1],3,3));
  } else if(ch==="X"){
    g.fillStyle="#2c1a0e"; g.fillRect(x,y,T,T); g.fillStyle="#c28a52"; g.fillRect(x+2,y+2,T-4,T-4);
    g.fillStyle="#e9b97d"; g.fillRect(x+2,y+2,T-4,4); g.fillRect(x+2,y+2,4,T-4);
    g.fillStyle="#8a5a2d"; g.fillRect(x+2,y+T-6,T-4,4); g.fillRect(x+T-6,y+2,4,T-4);
  } else if(ch==="a"||ch==="b"||ch==="c"||ch==="d"){
    const left=ch==="a"||ch==="c", top=ch==="a"||ch==="b";
    const gr=g.createLinearGradient(x,0,x+T,0);
    if(left){ gr.addColorStop(0,"#0c6a2a"); gr.addColorStop(.35,"#59e07a"); gr.addColorStop(1,"#18a443"); }
    else { gr.addColorStop(0,"#18a443"); gr.addColorStop(.7,"#0f8a37"); gr.addColorStop(1,"#0a5a22"); }
    g.fillStyle=gr;
    if(top){ g.fillRect(x+(left?-3:0),y,T+3,T); g.strokeStyle="#073d17"; g.lineWidth=2.5; g.strokeRect(x+(left?-3:0)+1,y+1,T+1,T-2); }
    else { g.fillRect(x+(left?4:0),y,T-4,T); g.fillStyle="#073d17"; g.fillRect(x+(left?4:T-3),y,3,T); }
  } else if(ch==="o"){
    const w=Math.abs(Math.sin(t*5+c*.4));
    g.fillStyle="#b87a00"; g.beginPath(); g.ellipse(x+T/2,y+T/2,10*w+2,14,0,0,7); g.fill();
    g.fillStyle="#ffd83d"; g.beginPath(); g.ellipse(x+T/2,y+T/2,8*w+1,12,0,0,7); g.fill();
    g.fillStyle="#fff3a0"; g.fillRect(x+T/2-1,y+T/2-7,2,10);
  }
}

function drawCastle(g,x,y){
  g.fillStyle="#9c5a32"; g.fillRect(x,y-T*3,T*5,T*3);
  g.fillStyle="#7a3f20"; for(let i=0;i<5;i++)for(let j=0;j<3;j++)if((i+j)%2===0)g.fillRect(x+i*T,y-T*3+j*T,T,2);
  g.fillStyle="#b86f42"; g.fillRect(x+T*1.5,y-T*4.4,T*2,T*1.4);
  for(let i=0;i<5;i++){ g.fillStyle="#9c5a32"; g.fillRect(x+i*T+2,y-T*3-14,T-8,14); }
  for(let i=0;i<2;i++){ g.fillStyle="#9c5a32"; g.fillRect(x+T*1.5+i*T*1.4,y-T*4.4-12,T*.6,12); }
  g.fillStyle="#1d0e08"; g.beginPath(); g.moveTo(x+T*2,y); g.lineTo(x+T*2,y-T*1.2); g.arc(x+T*2.5,y-T*1.2,T*.5,Math.PI,0); g.lineTo(x+T*3,y); g.fill();
  g.fillStyle="#1d0e08"; g.fillRect(x+T*.4,y-T*2.4,T*.5,T*.7); g.fillRect(x+T*4.1,y-T*2.4,T*.5,T*.7);
  g.strokeStyle="#ddd"; g.lineWidth=3; g.beginPath(); g.moveTo(x+T*2.5,y-T*4.4-12); g.lineTo(x+T*2.5,y-T*5.4); g.stroke();
  g.fillStyle="#e83a3a"; g.beginPath(); g.moveTo(x+T*2.5,y-T*5.4); g.lineTo(x+T*3.3,y-T*5.1); g.lineTo(x+T*2.5,y-T*4.8); g.fill();
}

return {
  name:"Super Plumber", icon:"🍄", c:"#5be7a9",
  desc:"A full side-scrolling world: pits, pipes, blocks, enemies and a flag.",
  help:"Stick: move. A or X: jump (hold for higher). B: run. Reach the flag!",
  dur:240,

  hud(){ return `WORLD 1-1   ⏱ ${Math.max(0,Math.ceil(S.left||0))}`; },

  init(P,env){
    build();
    Object.assign(S,{cam:0,t:0,items:[],coinFx:[],debris:[],pops:[],bumps:{},parts:[],done:0,left:240,finishOrder:0,flagT:null});
    P.forEach((p,i)=>{
      Object.assign(p,{x:100+i*34,y:GR*T,vx:0,vy:0,w:26,h:34,big:false,ground:true,face:1,dead:false,deadT:0,fin:0,finT:0,
        inv:0,lives:3,coins:0,out:false,safeX:100,jumping:false,score:0,gone:false});
    });
  },

  update(dt,now,left,P,env){
    const {W,H}=env, s=H/600, viewW=W/s;
    S.t+=dt; S.left=left;
    P.forEach(p=>GH.poll(p));

    P.forEach(p=>{
      if(p.out||p.gone)return;
      if(p.dead){
        p.deadT+=dt; p.vy+=2000*dt; p.y+=p.vy*dt;
        if(p.deadT>1.8){ if(p.lives>0)respawn(p); else p.out=true; }
        return;
      }
      p.inv=Math.max(0,p.inv-dt);
      p.h=p.big?64:34;
      if(p.fin){
        p.finT+=dt;
        if(p.fin===1){ // slide down pole
          p.x=S.flagC*T+T/2-10; p.vx=0; p.y=Math.min(GR*T-T,p.y+220*dt); p.face=1;
          if(p.y>=GR*T-T){ p.fin=2; p.finT=0; p.face=1; }
        } else if(p.fin===2){ // walk to castle
          p.ground=true; p.vx=150; p.x+=p.vx*dt; p.y=GR*T-T+(p.big?0:0); p.y=GR*T;
          if(p.x>(S.flagC+7.5)*T){ p.gone=true; }
        }
        return;
      }

      const pad=p.pad||{};
      const mv=Math.abs(Number(pad.x))>.2?Number(pad.x):0;
      const run=p.held.has("B")||p.held.has("R1");
      const jumpHeld=p.held.has("A")||p.held.has("X");
      const jumpJust=p.just.has("A")||p.just.has("X");
      const maxV=run?340:220;

      if(mv!==0){
        const acc=(p.ground?1500:900)*dt*(Math.sign(mv)!==Math.sign(p.vx)&&p.vx!==0&&p.ground?2.2:1);
        p.vx+=mv*acc; p.face=mv>0?1:-1;
        p.vx=GH.clamp(p.vx,-maxV,maxV);
      } else if(p.ground){
        p.vx-=Math.sign(p.vx)*Math.min(Math.abs(p.vx),1300*dt);
      } else p.vx*=Math.pow(.6,dt);
      if(Math.abs(p.vx)>maxV)p.vx-=Math.sign(p.vx)*Math.min(Math.abs(p.vx)-maxV,900*dt);

      if(jumpJust&&p.ground){ p.vy=-(Math.abs(p.vx)>260?860:810); p.ground=false; p.jumping=true; Sfx.play("hit"); }
      const g=(p.vy<0&&jumpHeld&&p.jumping)?1550:3400;
      p.vy=Math.min(950,p.vy+g*dt);
      if(p.vy>=0)p.jumping=false;

      const r1=moveBox(p,p.vx*dt,0); if(r1.x)p.vx=0;
      const r2=moveBox(p,0,p.vy*dt);
      p.ground=r2.gy;
      if(r2.gy){ p.vy=0; p.jumping=false; const c=Math.floor(p.x/T); if(!inPit(c-2)&&!inPit(c+2)&&groundCol(c))p.safeX=p.x; }
      if(r2.hy){ p.vy=80; bump(r2.bc,r2.br,p); }
      // left edge of camera acts as a wall
      if(p.x<S.cam+p.w/2){ p.x=S.cam+p.w/2; if(p.vx<0)p.vx=0; }
      if(p.y>ROWS*T+60){ kill(p); return; }

      // coin tiles
      const c0=Math.floor((p.x-p.w/2)/T), c1=Math.floor((p.x+p.w/2)/T), r0=Math.floor((p.y-p.h)/T), rr1=Math.floor((p.y-1)/T);
      for(let r=r0;r<=rr1;r++)for(let c=c0;c<=c1;c++){
        if(level[r]&&level[r][c]==="o"){ level[r][c]=" "; p.coins++; p.score+=20; Sfx.play("point"); GH.particle(S.parts,c*T+T/2,r*T+T/2,"#ffe46a",6,160); }
      }
      // flag
      if(p.x>=S.flagC*T-4){
        p.fin=1; p.finT=0; S.finishOrder++; if(S.flagT==null)S.flagT=S.t;
        const hb=Math.round(GH.clamp((GR*T-p.y)/(8*T),0,1)*4000);
        p.score+=1000+hb+Math.max(0,Math.round(left*5))+(S.finishOrder===1?500:0);
        pop(p.x,p.y-80,"FLAG! +"+(1000+hb),"#7dffb0"); Sfx.play("win");
        GH.particle(S.parts,p.x,p.y-40,"#fff",20,300);
      }
    });

    // items
    S.items.forEach(m=>{
      m.ph+=dt;
      if(m.emerge<1){ m.emerge=Math.min(1,m.emerge+dt/.6); m.y=m.by+T-(T)*m.emerge; if(m.emerge>=1){ m.vx=120; m.y=m.by; } }
      else {
        m.vy=Math.min(900,m.vy+2600*dt);
        const a=moveBox(m,m.vx*dt,0); if(a.x)m.vx*=-1;
        const b=moveBox(m,0,m.vy*dt); if(b.gy)m.vy=0;
        if(m.y>ROWS*T+80)m.dead=true;
      }
      P.forEach(p=>{
        if(m.dead||p.dead||p.out||p.gone||p.fin||m.emerge<1)return;
        if(Math.abs(p.x-m.x)<(p.w+m.w)/2&&p.y>m.y-m.h&&p.y-p.h<m.y){
          m.dead=true; p.score+=200; Sfx.play("join");
          if(!p.big){ p.big=true; p.h=64; p.y-=1; p.inv=.5; }
          pop(m.x,m.y-40,"+200","#ff9a9a");
        }
      });
    });
    S.items=S.items.filter(m=>!m.dead);

    // enemies
    S.enemies.forEach(e=>{
      if(e.dead===2){ e.vy+=2200*dt; e.y+=e.vy*dt; e.x+=e.vx*dt*.4; return; }
      if(e.dead===1){ e.dt=(e.dt||0)+dt; if(e.dt>.45)e.dead=3; return; }
      if(e.dead)return;
      if(!e.active){ if(e.x<S.cam+viewW+120)e.active=true; else return; }
      e.vy=Math.min(900,e.vy+2400*dt);
      const a=moveBox(e,e.vx*dt,0); if(a.x)e.vx*=-1;
      moveBox(e,0,e.vy*dt);
      const b=moveBox({x:e.x,y:e.y,w:e.w,h:e.h},0,0);
      if(e.y>ROWS*T+80)e.dead=3;
      if(e.x<S.cam-200)e.dead=3;
      P.forEach(p=>{
        if(e.dead||p.dead||p.out||p.gone||p.fin)return;
        if(Math.abs(p.x-e.x)<(p.w+e.w)/2-2&&p.y>e.y-e.h&&p.y-p.h<e.y){
          const stomp=p.vy>40&&p.y<e.y-12&&e.kind!=="spiny";
          if(stomp){
            e.dead=1; p.vy=(p.held.has("A")||p.held.has("X"))?-720:-440; p.score+=100; Sfx.play("hit");
            pop(e.x,e.y-34,"100"); GH.particle(S.parts,e.x,e.y-10,"#8a5a33",8,160);
          } else hurt(p);
        }
      });
    });
    S.enemies=S.enemies.filter(e=>e.dead!==3);

    // fx lists
    S.coinFx.forEach(c=>{ c.t-=dt; c.y+=c.vy*dt; c.vy+=1800*dt; });
    S.coinFx=S.coinFx.filter(c=>c.t>0);
    S.debris.forEach(d=>{ d.x+=d.vx*dt; d.y+=d.vy*dt; d.vy+=2400*dt; d.rot+=dt*10; });
    S.debris=S.debris.filter(d=>d.y<ROWS*T+100);
    S.pops.forEach(q=>{ q.t-=dt; q.y-=40*dt; }); S.pops=S.pops.filter(q=>q.t>0);
    Object.keys(S.bumps).forEach(k=>{ S.bumps[k]-=dt; if(S.bumps[k]<=0)delete S.bumps[k]; });
    S.parts=GH.updateParticles(S.parts,dt);

    // camera
    const act=P.filter(p=>!p.dead&&!p.out&&!p.gone);
    const lead=act.length?Math.max(...act.map(p=>p.x)):S.cam+viewW*.4;
    S.cam=GH.clamp(Math.max(S.cam,lead-viewW*.42),0,COLS*T-viewW);

    S.done=P.every(p=>p.gone||p.out)?1:0;
  },

  draw(g,W,H,P){
    const s=H/600, viewW=W/s, cam=S.cam, t=S.t;
    // sky
    let gr=g.createLinearGradient(0,0,0,H); gr.addColorStop(0,"#4a9dff"); gr.addColorStop(.7,"#9ad4ff"); gr.addColorStop(1,"#d8f1ff");
    g.fillStyle=gr; g.fillRect(0,0,W,H);
    // sun
    GH.glow(g,W*.82,H*.16,H*.3,"rgba(255,248,200,.9)",.7);
    g.fillStyle="#fff7c8"; g.beginPath(); g.arc(W*.82,H*.16,H*.06,0,7); g.fill();
    // clouds
    for(let i=0;i<9;i++){
      const x=((i*430-cam*.2*s)%(W+600)+W+600)%(W+600)-200;
      GH.drawCloud(g,x,H*(.1+(i%3)*.1),s*(1.2+(i%3)*.35));
    }
    // far hills
    for(let layer=0;layer<2;layer++){
      const par=layer?.5:.3, col=layer?"#4cb85a":"#7bd98a", base=H-(ROWS-GR)*T*s;
      g.fillStyle=col;
      for(let i=-1;i<W/(300*s)+3;i++){
        const x=((i*300*s-cam*par*s)%(W+300*s)+W+300*s)%(W+300*s)-150*s, hh=(80+((i*37)%5)*22+layer*28)*s;
        g.beginPath(); g.ellipse(x,base,(120+layer*30)*s,hh,0,Math.PI,0); g.fill();
      }
    }
    g.save(); g.scale(s,s); g.translate(-cam,0);
    const c0=Math.max(0,Math.floor(cam/T)-1), c1=Math.min(COLS-1,Math.ceil((cam+viewW)/T)+1);
    // bushes
    for(let i=0;i<COLS/9;i++){
      const bx=i*9*T+3*T; if(bx<cam-200||bx>cam+viewW+200)continue;
      g.fillStyle="#2f9a3e"; [[0,0,26],[28,6,20],[-26,8,18],[54,10,14]].forEach(b=>{ g.beginPath(); g.arc(bx+b[0],GR*T-b[2]*.4+(b[1]-8)*-.2,b[2],Math.PI,0); g.fill(); });
      g.fillStyle="#58d567"; g.beginPath(); g.arc(bx,GR*T-12,16,Math.PI,0); g.fill();
    }
    // castle
    drawCastle(g,(S.flagC+3)*T+T,GR*T);
    // flag pole
    const fx=S.flagC*T+T/2;
    g.fillStyle="#e9eef2"; g.fillRect(fx-3,(GR-10)*T,6,10*T-T);
    g.fillStyle="#ffd83d"; g.beginPath(); g.arc(fx,(GR-10)*T-4,9,0,7); g.fill();
    const flagY=(GR-9.6)*T+(S.flagT!=null?Math.min(7.5*T,(S.t-S.flagT)*180):0);
    g.fillStyle="#2ee06b"; g.beginPath(); g.moveTo(fx-3,flagY); g.lineTo(fx-46,flagY+18); g.lineTo(fx-3,flagY+36); g.fill();
    g.fillStyle="#fff"; g.beginPath(); g.arc(fx-20,flagY+18,6,0,7); g.fill();
    // tiles
    for(let r=0;r<ROWS;r++)for(let c=c0;c<=c1;c++){
      const ch=level[r][c]; if(ch===" ")continue;
      let yo=0; const b=S.bumps[c+","+r]; if(b)yo=-Math.sin(b/.18*Math.PI)*9;
      drawTile(g,ch,c*T,r*T+yo,t,c,r);
    }
    // coin pops
    S.coinFx.forEach(c=>{ const w=Math.abs(Math.sin(c.t*18)); g.fillStyle="#ffd83d"; g.beginPath(); g.ellipse(c.x,c.y,9*w+2,13,0,0,7); g.fill(); });
    // items
    S.items.forEach(m=>{ g.save(); if(m.emerge<1){ g.beginPath(); g.rect(m.x-30,m.by-60,60,60+0); g.clip(); } drawMush(g,m.x,m.y); g.restore(); });
    // enemies
    S.enemies.forEach(e=>{ if(e.x<cam-80||e.x>cam+viewW+80)return; drawGrunt(g,e,e.x,e.y,t); });
    // debris
    S.debris.forEach(d=>{ g.save(); g.translate(d.x,d.y); g.rotate(d.rot); g.fillStyle="#b5521f"; g.fillRect(-7,-7,14,14); g.fillStyle="#3b1608"; g.fillRect(-7,-1,14,2); g.restore(); });
    // players
    P.forEach(p=>{
      if(p.out||p.gone)return;
      if(p.inv>0&&Math.floor(p.inv*14)%2)g.globalAlpha=.4;
      const nm=p.name;
      drawPlumber(g,p,p.x,p.y,t);
      g.globalAlpha=1;
      g.font="700 15px Fredoka,sans-serif"; g.textAlign="center"; g.fillStyle="rgba(0,0,0,.45)";
      const ty=p.y-p.h-(p.big?22:6)-14;
      g.fillRect(p.x-g.measureText(nm).width/2-6,ty-10,g.measureText(nm).width+12,20);
      g.fillStyle=p.c; g.textBaseline="middle"; g.fillText(nm,p.x,ty);
    });
    GH.drawParticles(g,S.parts);
    S.pops.forEach(q=>{ g.globalAlpha=Math.min(1,q.t*2); GH.text(g,q.txt,q.x,q.y,20,q.c); g.globalAlpha=1; });
    g.restore();

    // HUD
    g.save(); g.textBaseline="middle";
    P.forEach((p,i)=>{
      const y=26+i*30, w=Math.min(340,W*.5);
      g.fillStyle="rgba(10,10,30,.55)"; g.beginPath(); g.roundRect(10,y-13,w,26,8); g.fill();
      g.fillStyle=p.c; g.beginPath(); g.arc(26,y,8,0,7); g.fill();
      g.textAlign="left"; g.font="700 16px Fredoka,sans-serif"; g.fillStyle="#fff";
      g.fillText(`${p.name}`,42,y); 
      g.textAlign="right"; g.fillText(`🪙${p.coins}   ♥${Math.max(0,p.lives)}   ${p.score}`,w+4,y);
    });
    P.forEach(p=>{ if(p.out) GH.text(g,`${p.name}: GAME OVER`,W/2,H*.5,34,p.c); });
    g.restore();
  },

  over(){ return !!S.done; }
};
}

/* =========================================================
   STREET RUSH  -  night-city pseudo-3D racer (split screen)
========================================================= */

function makeNeon(){

const SEG=200, ROAD=2000, CAMH=1050, DRAW=150, RUMB=3, LANES=3, MAXV=SEG*60;
const FOV=100, CAMD=1/Math.tan((FOV/2)*Math.PI/180);
const CARCOL=["#ff3d81","#ffc400","#2ee6d6","#7a5cff","#ff7a1a","#4dabf7","#e8eef8"];
let segs=[], N=0;
const S={t:0,left:60};

const easeIn=(a,b,p)=>a+(b-a)*p*p;
const easeIO=(a,b,p)=>a+(b-a)*(-Math.cos(p*Math.PI)/2+.5);
const lastY=()=>segs.length?segs[segs.length-1].p2.y:0;

function addSeg(curve,y){
  const n=segs.length;
  segs.push({i:n,p1:{z:n*SEG,y:lastY()},p2:{z:(n+1)*SEG,y},curve,dark:Math.floor(n/RUMB)%2===1});
}
function addRoad(en,hold,lv,curve,y){
  const sy=lastY(), ey=sy+y*SEG, tot=en+hold+lv;
  for(let n=0;n<en;n++)addSeg(easeIn(0,curve,n/en),easeIO(sy,ey,n/tot));
  for(let n=0;n<hold;n++)addSeg(curve,easeIO(sy,ey,(en+n)/tot));
  for(let n=0;n<lv;n++)addSeg(easeIO(curve,0,n/lv),easeIO(sy,ey,(en+hold+n)/tot));
}
function build(){
  segs=[];
  addRoad(25,25,25,0,0);
  addRoad(25,35,25,2,0);
  addRoad(25,25,25,0,30);
  addRoad(25,35,25,-3,-12);
  addRoad(20,30,20,4,22);
  addRoad(25,25,25,0,-26);
  addRoad(30,40,30,-5,0);
  addRoad(25,30,25,3,16);
  addRoad(25,25,25,-2,-20);
  addRoad(35,35,35,0,0);
  addRoad(30,30,30,0,-lastY()/SEG);
  N=segs.length;
}
const segAt=z=>segs[Math.floor(z/SEG)%N];
const lerp=(a,b,k)=>a+(b-a)*k;

function carRear(g,cx,by,w,col,o){
  o=o||{};
  const h=w*(o.type===2?.9:.56), tall=o.type===2;
  g.save();
  g.fillStyle="rgba(0,0,0,.55)"; g.beginPath(); g.ellipse(cx,by,w*.62,h*.14,0,0,7); g.fill();
  if(o.glow){ const gr=g.createRadialGradient(cx,by,2,cx,by,w*.9); gr.addColorStop(0,o.glow+"aa"); gr.addColorStop(1,"rgba(0,0,0,0)"); g.save(); g.globalCompositeOperation="lighter"; g.fillStyle=gr; g.beginPath(); g.ellipse(cx,by,w*.9,h*.3,0,0,7); g.fill(); g.restore(); }
  // tires
  g.fillStyle="#08080c"; g.beginPath(); g.roundRect(cx-w*.5,by-h*.38,w*.16,h*.4,w*.03); g.roundRect(cx+w*.34,by-h*.38,w*.16,h*.4,w*.03); g.fill();
  // lower body
  g.fillStyle=col; g.beginPath(); g.roundRect(cx-w*.47,by-h*.66,w*.94,h*.52,w*.07); g.fill();
  g.fillStyle="rgba(0,0,0,.28)"; g.fillRect(cx-w*.46,by-h*.2,w*.92,h*.07);
  g.fillStyle="rgba(255,255,255,.22)"; g.fillRect(cx-w*.44,by-h*.64,w*.88,h*.05);
  // cabin
  const ct=by-h*(tall?1.55:1.08), cw1=w*(tall?.46:.3), cw2=w*(tall?.46:.38);
  g.fillStyle=o.dark||col; g.beginPath(); g.moveTo(cx-cw2,by-h*.66); g.lineTo(cx-cw1,ct); g.lineTo(cx+cw1,ct); g.lineTo(cx+cw2,by-h*.66); g.closePath(); g.fill();
  g.fillStyle="#0e1628"; g.beginPath(); g.moveTo(cx-cw2*.86,by-h*.7); g.lineTo(cx-cw1*.85,ct+h*.07); g.lineTo(cx+cw1*.85,ct+h*.07); g.lineTo(cx+cw2*.86,by-h*.7); g.closePath(); g.fill();
  g.fillStyle="rgba(140,190,255,.2)"; g.beginPath(); g.moveTo(cx-cw2*.7,by-h*.7); g.lineTo(cx-cw1*.5,ct+h*.07); g.lineTo(cx-cw1*.1,ct+h*.07); g.lineTo(cx-cw2*.3,by-h*.7); g.fill();
  if(o.spoiler){
    g.fillStyle="#0b0b12"; g.fillRect(cx-w*.5,ct-h*.02,w*.08,h*.2); g.fillRect(cx+w*.42,ct-h*.02,w*.08,h*.2);
    g.fillStyle=o.dark||col; g.fillRect(cx-w*.55,ct-h*.06,w*1.1,h*.1);
    g.fillStyle="rgba(255,255,255,.3)"; g.fillRect(cx-w*.55,ct-h*.06,w*1.1,h*.025);
  }
  // tail lights
  const lc=o.brake?"#ff2a2a":"#c01818";
  g.fillStyle=lc; g.beginPath(); g.roundRect(cx-w*.44,by-h*.55,w*.24,h*.14,w*.02); g.roundRect(cx+w*.2,by-h*.55,w*.24,h*.14,w*.02); g.fill();
  g.fillRect(cx-w*.2,by-h*.5,w*.4,h*.04);
  g.save(); g.globalCompositeOperation="lighter"; g.globalAlpha=o.brake?.9:.55;
  [[-.32],[.32]].forEach(q=>{ const gr=g.createRadialGradient(cx+q[0]*w,by-h*.48,1,cx+q[0]*w,by-h*.48,w*.22); gr.addColorStop(0,"#ff3030"); gr.addColorStop(1,"rgba(0,0,0,0)"); g.fillStyle=gr; g.beginPath(); g.arc(cx+q[0]*w,by-h*.48,w*.22,0,7); g.fill(); });
  g.restore();
  // plate + bumper
  g.fillStyle="#e9eef5"; g.fillRect(cx-w*.1,by-h*.36,w*.2,h*.1);
  g.fillStyle="#12121a"; g.fillRect(cx-w*.46,by-h*.18,w*.92,h*.1);
  if(o.flame){
    [-.3,.3].forEach(q=>{ const fl=h*(.5+Math.random()*.4);
      const gr=g.createLinearGradient(0,by-h*.12,0,by-h*.12+fl); gr.addColorStop(0,"#fff"); gr.addColorStop(.3,"#7fd8ff"); gr.addColorStop(1,"rgba(60,90,255,0)");
      g.fillStyle=gr; g.beginPath(); g.moveTo(cx+q*w-w*.05,by-h*.12); g.lineTo(cx+q*w,by-h*.12+fl); g.lineTo(cx+q*w+w*.05,by-h*.12); g.fill(); });
  }
  g.restore();
}

function drawSky(g,vw,vh,hor,p){
  let gr=g.createLinearGradient(0,0,0,hor); gr.addColorStop(0,"#07051a"); gr.addColorStop(.55,"#2a0f4d"); gr.addColorStop(1,"#c9327e");
  g.fillStyle=gr; g.fillRect(0,0,vw,hor+2);
  for(let i=0;i<50;i++){ g.fillStyle=`rgba(255,255,255,${.3+.4*Math.sin(S.t*2+i)})`; g.fillRect(GH.hash(i)*vw,GH.hash(i+30)*hor*.6,1.5,1.5); }
  // retro sun
  const sx=vw/2-p.bg*.05, sr=Math.min(vw*.17,hor*.5);
  g.save(); g.beginPath(); g.arc(sx,hor-sr*.15,sr,0,7); g.clip();
  const sg=g.createLinearGradient(0,hor-sr*1.2,0,hor+sr); sg.addColorStop(0,"#ffe45e"); sg.addColorStop(.5,"#ff6a3d"); sg.addColorStop(1,"#d1237f");
  g.fillStyle=sg; g.fillRect(sx-sr,hor-sr*1.2,sr*2,sr*2.4);
  g.fillStyle="#2a0f4d"; for(let i=0;i<6;i++){ g.fillRect(sx-sr,hor-sr*.5+i*sr*.16,sr*2,sr*.02*(i+1)); }
  g.restore();
  // skyline layers
  [[.25,.5,"#1a0b36",34],[.6,.9,"#0f0624",46]].forEach(([par,hs,col,wd],li)=>{
    const total=vw*2.4, off=((p.bg*par)%total+total)%total;
    for(let i=-2;i<total/wd+2;i++){
      const bw=wd*(.8+GH.hash(i+li*99)*.9), bh=hor*(.1+GH.hash(i*3+li*7)*.32)*hs*1.5;
      const x=((i*wd-off)%total+total)%total-wd*2;
      g.fillStyle=col; g.fillRect(x,hor-bh,bw,bh+2);
      if(li){ g.fillStyle="rgba(255,210,120,.75)";
        for(let wy=hor-bh+8;wy<hor-6;wy+=12)for(let wx=x+5;wx<x+bw-8;wx+=10) if(GH.hash(wx*.31+wy*.17+i)>.62)g.fillRect(wx,wy,3,5);
        g.fillStyle=i%3===0?"#ff2d95":"#2ee6d6"; g.fillRect(x+bw*.4,hor-bh-5,2,5); }
    }
  });
}

function drawSeg(g,vw,x1,y1,w1,x2,y2,w2,seg,fogA){
  const r1=w1/Math.max(6,2*LANES), r2=w2/Math.max(6,2*LANES);
  const l1=w1/Math.max(32,8*LANES), l2=w2/Math.max(32,8*LANES);
  const poly=(a,b,c,d,e,f,h,i,col)=>{ g.fillStyle=col; g.beginPath(); g.moveTo(a,b); g.lineTo(c,d); g.lineTo(e,f); g.lineTo(h,i); g.closePath(); g.fill(); };
  g.fillStyle=seg.dark?"#120a2a":"#1a0f3a"; g.fillRect(0,y2,vw,y1-y2);
  poly(x1-w1-r1,y1,x1-w1,y1,x2-w2,y2,x2-w2-r2,y2,seg.dark?"#ff2d95":"#f4f1ff");
  poly(x1+w1+r1,y1,x1+w1,y1,x2+w2,y2,x2+w2+r2,y2,seg.dark?"#ff2d95":"#f4f1ff");
  poly(x1-w1,y1,x1+w1,y1,x2+w2,y2,x2-w2,y2,seg.dark?"#2c2a3c":"#34324a");
  if(!seg.dark){
    const lw1=w1*2/LANES, lw2=w2*2/LANES;
    for(let l=1;l<LANES;l++){
      const lx1=x1-w1+lw1*l, lx2=x2-w2+lw2*l;
      poly(lx1-l1/2,y1,lx1+l1/2,y1,lx2+l2/2,y2,lx2-l2/2,y2,"#e9e6ff");
    }
  }
  if(fogA>0){ g.globalAlpha=fogA; g.fillStyle="#7a1f66"; g.fillRect(0,y2,vw,y1-y2+1); g.globalAlpha=1; }
}

function renderView(g,vw,vh,p){
  const hor=vh*.44;
  drawSky(g,vw,vh,hor,p);
  const bi=Math.floor(p.z/SEG), base=segs[bi%N], bp=(p.z%SEG)/SEG;
  const camY=CAMH+lerp(base.p1.y,base.p2.y,bp);
  const camD=CAMD*(1+(p.boostK||0)*.1);
  let x=0, dx=-base.curve*bp, maxy=vh;
  const vis=[];
  const proj=(pt,cx,cz)=>{
    const sc=camD/cz;
    return {sc,x:Math.round(vw/2+sc*(pt.x-cx)*vw/2),y:Math.round(hor-sc*(pt.y-camY)*vh/2*1.05),w:Math.round(sc*ROAD*vw/2),cz};
  };
  for(let n=0;n<DRAW;n++){
    const idx=bi+n, seg=segs[idx%N];
    const z1=idx*SEG, z2=z1+SEG;
    const P1=proj({x:0,y:seg.p1.y},p.x*ROAD-x,z1-p.z);
    const P2=proj({x:0,y:seg.p2.y},p.x*ROAD-x-dx,z2-p.z);
    vis.push({seg,P1,P2,clip:maxy,idx});
    x+=dx; dx+=seg.curve;
    if(P1.cz<=camD||P2.y>=P1.y||P2.y>=maxy)continue;
    drawSeg(g,vw,P1.x,P1.y,P1.w,P2.x,P2.y,P2.w,seg,Math.pow(n/DRAW,2.2)*.95);
    maxy=P1.y;
  }
  // sprites far-to-near
  const carsByIdx=new Map();
  p.traffic.forEach(c=>{ const i=Math.floor(c.z/SEG); if(i>bi&&i<bi+DRAW){ (carsByIdx.get(i)||carsByIdx.set(i,[]).get(i)).push(c); } });
  for(let n=DRAW-1;n>0;n--){
    const v=vis[n]; if(!v)continue;
    const {seg,P1,P2,clip,idx}=v;
    if(P1.cz<=camD)continue;
    g.save(); g.beginPath(); g.rect(0,0,vw,clip); g.clip();
    // lamps & billboards
    if(idx%9===0){
      [-1,1].forEach(side=>{
        const px=P1.x+side*P1.w*1.28, py=P1.y, ph=P1.sc*1500*vh/2, pw=Math.max(1,P1.sc*40*vw/2);
        g.fillStyle="#0b0820"; g.fillRect(px-pw/2,py-ph,pw,ph);
        g.fillRect(px-pw/2+(side<0?0:-ph*.0),py-ph,side*-ph*.0+pw,pw);
        GH.glow(g,px-side*ph*.12,py-ph,Math.max(8,ph*.35),"#ffb35c",.8);
        g.fillStyle="#fff3d0"; g.beginPath(); g.arc(px-side*ph*.12,py-ph,Math.max(1.5,pw*1.2),0,7); g.fill();
        g.fillStyle="#0b0820"; g.fillRect(Math.min(px,px-side*ph*.12),py-ph-pw*.4,Math.abs(side*ph*.12)+pw,pw*.8);
      });
    }
    if(idx%47===12){
      const side=(idx%2?1:-1), px=P1.x+side*P1.w*1.9, py=P1.y, bw=P1.sc*1500*vw/2, bh=bw*.5;
      g.fillStyle="#0b0820"; g.fillRect(px-bw*.03,py-bh*1.5,bw*.06,bh*1.5);
      g.fillStyle=idx%3?"#ff2d95":"#2ee6d6"; g.fillRect(px-bw/2,py-bh*2.1,bw,bh);
      g.fillStyle="#0b0820"; g.fillRect(px-bw/2+bw*.04,py-bh*2.1+bh*.08,bw*.92,bh*.84);
      GH.glow(g,px,py-bh*1.6,bw*.7,idx%3?"#ff2d95":"#2ee6d6",.45);
      g.fillStyle=idx%3?"#ff2d95":"#2ee6d6"; g.font=`700 ${Math.max(6,bh*.5)}px Fredoka,sans-serif`; g.textAlign="center"; g.textBaseline="middle";
      g.fillText(["NITRO","TURBO","NEON","RUSH"][idx%4],px,py-bh*1.6);
    }
    const cs=carsByIdx.get(idx);
    if(cs)cs.forEach(c=>{
      const pc=((c.z%SEG)/SEG);
      const sc=lerp(P1.sc,P2.sc,pc), sy=lerp(P1.y,P2.y,pc), sxr=lerp(P1.x,P2.x,pc);
      const sxp=sxr+sc*c.off*ROAD*vw/2, w=sc*ROAD*.34*vw/2;
      carRear(g,sxp+(c.hit?c.spin*sc*ROAD*.4*vw/2:0),sy,w,c.col,{type:c.type,brake:c.hit,dark:c.dark});
    });
    g.restore();
  }
  // player car
  const cw=Math.min(vw*.3,vh*.52), cy=vh*.93+(p.shake>0?(Math.random()-.5)*5:0)-(p.v>0?Math.sin(S.t*40)*(p.v/MAXV)*1.5:0);
  const tilt=p.steerV*.05;
  g.save(); g.translate(vw/2+(p.shake>0?(Math.random()-.5)*8:0),cy); g.rotate(tilt); g.translate(-vw/2,-cy);
  carRear(g,vw/2,cy,cw,p.c,{spoiler:true,brake:p.braking,flame:p.boost,glow:p.c,dark:"#14101f"});
  g.restore();
  // speed lines
  const sp=p.v/MAXV;
  if(sp>.7||p.boost){
    g.save(); g.globalAlpha=Math.min(.5,(sp-.55)*.9+(p.boost?.25:0)); g.strokeStyle="#fff"; g.lineWidth=2;
    for(let i=0;i<22;i++){ const a=GH.hash(i+Math.floor(S.t*14))*Math.PI*2, r0=Math.min(vw,vh)*(.35+GH.hash(i*3)*.2), r1=r0*(1.4+GH.hash(i)*.6);
      g.beginPath(); g.moveTo(vw/2+Math.cos(a)*r0,hor+Math.sin(a)*r0*.7); g.lineTo(vw/2+Math.cos(a)*r1,hor+Math.sin(a)*r1*.7); g.stroke(); }
    g.restore();
  }
  if(p.boost){ const gr=g.createRadialGradient(vw/2,vh/2,vh*.25,vw/2,vh/2,vh*.9); gr.addColorStop(0,"rgba(80,160,255,0)"); gr.addColorStop(1,"rgba(80,160,255,.35)"); g.fillStyle=gr; g.fillRect(0,0,vw,vh); }
}

function hud(g,vw,vh,p,rank,total){
  const kmh=Math.round(p.v/MAXV*260);
  g.save(); g.textBaseline="middle";
  const sz=Math.min(vw,vh*1.6);
  // speed
  g.fillStyle="rgba(8,4,24,.62)"; g.beginPath(); g.roundRect(12,vh-92*sz/700-80,Math.max(150,sz*.26),Math.max(76,sz*.13),14); g.fill();
  const bx=12+14, by=vh-80-92*sz/700+Math.max(76,sz*.13)/2;
  g.textAlign="left"; g.font=`700 ${Math.max(34,sz*.075)}px Fredoka,sans-serif`; g.fillStyle=p.boost?"#7fd8ff":"#fff"; g.fillText(kmh,bx,by-4);
  g.font=`600 ${Math.max(11,sz*.02)}px Fredoka,sans-serif`; g.fillStyle="#bdb3dc"; g.fillText("KM/H",bx+Math.max(34,sz*.075)*1.8,by+8);
  g.fillText("GEAR "+(Math.min(6,Math.floor(p.v/MAXV*6)+1)),bx+Math.max(34,sz*.075)*1.8,by-12);
  // nitro bar
  const nw=Math.max(150,sz*.26)-28, ny=by+Math.max(76,sz*.13)/2-14;
  g.fillStyle="rgba(255,255,255,.12)"; g.beginPath(); g.roundRect(bx,ny,nw,8,4); g.fill();
  g.fillStyle=p.nitro>.98?`hsl(${(S.t*400)%360},90%,62%)`:"#46c8ff"; g.beginPath(); g.roundRect(bx,ny,nw*p.nitro,8,4); g.fill();
  // top bar
  g.fillStyle="rgba(8,4,24,.62)"; g.beginPath(); g.roundRect(10,10,Math.min(vw-20,260),34,10); g.fill();
  g.textAlign="left"; g.font="700 16px Fredoka,sans-serif"; g.fillStyle=p.c; g.fillText(`${p.name}`,22,27);
  g.textAlign="right"; g.fillStyle="#fff"; g.fillText(`${p.score} pts`,Math.min(vw-20,260)-2,27);
  if(total>1){ g.textAlign="right"; g.font=`700 ${Math.max(26,sz*.05)}px Fredoka,sans-serif`; g.fillStyle="rgba(255,255,255,.9)"; g.fillText(`${rank}/${total}`,vw-14,vh*.5-vh*.2); }
  // popup
  if(p.pop&&p.pop.t>0){ GH.bigText(g,p.pop.txt,vw/2,vh*.3-(1-p.pop.t)*20,Math.max(18,sz*.04),"#fff",p.pop.c||"#ffb703",1,Math.min(1,p.pop.t*2)); }
  if(p.combo>1) { g.textAlign="center"; g.font="700 14px Fredoka,sans-serif"; g.fillStyle="#ffe08a"; g.fillText(`combo x${p.combo}`,vw/2,vh*.3+26); }
  g.restore();
}

return {
  name:"Street Rush", icon:"🏁", c:"#ff2d95",
  desc:"Night-city street racing with traffic, near-misses and nitro.",
  help:"Steer with stick or tilt. A/X nitro. Stick down brakes. Split screen.",
  dur:75,

  init(P,env){
    build();
    S.t=0; S.left=75;
    P.forEach((p,i)=>{
      Object.assign(p,{z:i*0,x:(i%3-1)*.35,v:0,steerV:0,nitro:.4,boost:false,braking:false,boostK:0,dist:0,bonus:0,combo:0,
        traffic:[],spawnZ:SEG*60,shake:0,bg:0,pop:null,score:0});
    });
  },

  update(dt,now,left,P,env){
    S.t+=dt; S.left=left;
    P.forEach(p=>{
      const seg=segAt(p.z), sp=p.v/MAXV;
      const steer=GH.sx(p,env.keys);
      const braking=(Number(p.pad?.y)||0)>.55||GH.pressed(p,"L2");
      const nk=GH.pressed(p,"A")||GH.pressed(p,"X")||GH.pressed(p,"R2");
      p.braking=braking;
      p.boost=nk&&p.nitro>.02&&!braking;
      if(p.boost)p.nitro=Math.max(0,p.nitro-dt*.3); else p.nitro=Math.min(1,p.nitro+dt*.03);
      p.boostK+=((p.boost?1:0)-p.boostK)*Math.min(1,dt*6);
      const cap=MAXV*(p.boost?1.38:1);
      if(braking)p.v-=MAXV*1.1*dt;
      else if(p.v<cap)p.v+=MAXV*(p.boost?.7:.3)*dt;
      else p.v-=MAXV*.4*dt;
      if(Math.abs(p.x)>1.02){ if(p.v>MAXV*.3)p.v-=MAXV*1.0*dt; p.shake=Math.max(p.shake,.1); }
      p.v=GH.clamp(p.v,0,MAXV*1.45);
      const dx=dt*2*Math.min(1,p.v/MAXV);
      p.steerV+=(steer-p.steerV)*Math.min(1,dt*8);
      p.x+=steer*dx*1.45;
      p.x-=dx*sp*seg.curve*.32;
      p.x=GH.clamp(p.x,-2.3,2.3);
      p.z+=p.v*dt; p.dist+=p.v*dt;
      p.bg-=seg.curve*sp*dt*220;
      p.shake=Math.max(0,p.shake-dt);
      if(p.pop)p.pop.t-=dt;

      // traffic
      while(p.spawnZ<p.z+DRAW*SEG*1.1){
        const off=[-.66,0,.66][Math.floor(Math.random()*3)]+GH.random(-.1,.1);
        p.traffic.push({z:p.spawnZ,off,v:MAXV*GH.random(.26,.48),col:CARCOL[Math.floor(Math.random()*CARCOL.length)],
          type:Math.random()<.2?2:Math.random()<.4?1:0,hit:false,spin:0,passed:false,dark:"#1a1424"});
        p.spawnZ+=GH.random(1300,2600);
      }
      p.traffic.forEach(c=>{
        c.z+=c.v*dt;
        if(c.hit){ c.spin+=dt*1.6*Math.sign(c.spin||1); c.v*=Math.pow(.5,dt); }
        const dz=c.z-p.z;
        if(!c.hit&&dz>-120&&dz<260&&Math.abs(c.off-p.x)<.3&&Math.abs(p.x)<1.4){
          c.hit=true; c.spin=Math.sign(c.off-p.x)||1;
          p.v=Math.min(p.v,c.v*.7); p.shake=.5; p.combo=0; p.bonus-=40;
          Sfx.play("out"); p.pop={txt:"CRASH",t:1,c:"#ff4d4d"};
        }
        if(!c.passed&&!c.hit&&dz<-150){
          c.passed=true;
          if(Math.abs(c.off-p.x)<.55&&p.v>MAXV*.5){
            p.combo++; const b=15*Math.min(8,p.combo); p.bonus+=b; p.nitro=Math.min(1,p.nitro+.1);
            p.pop={txt:`NEAR MISS +${b}`,t:1,c:"#7fd8ff"}; Sfx.play("point");
          }
        }
      });
      p.traffic=p.traffic.filter(c=>c.z>p.z-1500);
      p.score=Math.max(0,Math.floor(p.dist/150)+p.bonus);
    });
  },

  draw(g,W,H,P){
    const n=P.length, rows=n>4?2:1, cols=Math.ceil(n/rows), vw=W/cols, vh=H/rows;
    const ranked=[...P].sort((a,b)=>b.score-a.score);
    P.forEach((p,i)=>{
      const cx=(i%cols)*vw, cy=Math.floor(i/cols)*vh;
      g.save(); g.beginPath(); g.rect(cx,cy,vw,vh); g.clip(); g.translate(cx,cy);
      renderView(g,vw,vh,p);
      hud(g,vw,vh,p,ranked.indexOf(p)+1,n);
      // vignette
      const vg=g.createRadialGradient(vw/2,vh/2,vh*.4,vw/2,vh/2,vh*.95); vg.addColorStop(0,"rgba(0,0,0,0)"); vg.addColorStop(1,"rgba(5,0,15,.5)"); g.fillStyle=vg; g.fillRect(0,0,vw,vh);
      g.restore();
    });
    g.strokeStyle="#ff2d95"; g.lineWidth=3;
    for(let c=1;c<cols;c++){ g.beginPath(); g.moveTo(c*vw,0); g.lineTo(c*vw,H); g.stroke(); }
    if(rows>1){ g.beginPath(); g.moveTo(0,vh); g.lineTo(W,vh); g.stroke(); }
  },

  over(){ return false; }
};
}

/* =========================================================
   REGISTRY (order = order on the picker)
========================================================= */

const GAMES = {
  fighter:  makeFighter(),
  platform: makePlatformer(),
  neon:     makeNeon(),
  target:   SMALL.target,
  fruit:    SMALL.fruit,
  reaction: SMALL.reaction
};


"use strict";

/*
  MOTIONPLAY GAME REGISTRY

  CONTROLLER INPUT
  p.pad.x       Left stick horizontal (-1 to 1)
  p.pad.y       Left stick vertical (-1 to 1)
  p.pad.rx      Right stick horizontal (-1 to 1)
  p.pad.ry      Right stick vertical (-1 to 1)
  p.pad.buttons Array: A, B, X, Y, L1, L2, R1, R2, START, SELECT

  Existing input:
  p.in.s        Phone tilt horizontal
  p.in.y        Phone tilt vertical
  p.fire        Existing fire input

  KEYBOARD
  Arrows / WASD = left stick
  IJKL          = right stick
  Space         = A
  Shift         = B
  E             = X
  Q             = Y
  Enter         = START
  Mouse         = aiming

  Game interface:
  meta + init(P,env) + update(dt,now,left,P,env)
       + draw(g,W,H,P,left,env) + over(P)

  Motion Racer is handled specially by index.html.
*/


/* =========================================================
   SHARED HELPERS
========================================================= */

const GH = {

  sx(p,k={}) {
    if(p.id === "kb") {
      return (
        (k.ArrowRight || k.d ? 1 : 0) -
        (k.ArrowLeft || k.a ? 1 : 0)
      );
    }

    const stick = Number(p.pad?.x) || 0;
    return Math.abs(stick) > .12 ? stick : (p.in?.s || 0);
  },

  sy(p,k={}) {
    if(p.id === "kb") {
      return (
        (k.ArrowDown || k.s ? 1 : 0) -
        (k.ArrowUp || k.w ? 1 : 0)
      );
    }

    const stick = Number(p.pad?.y) || 0;
    return Math.abs(stick) > .12 ? stick : (p.in?.y || 0);
  },

  rx(p,k={}) {
    if(p.id === "kb") {
      return (
        (k.l ? 1 : 0) -
        (k.j ? 1 : 0)
      );
    }

    return Number(p.pad?.rx) || 0;
  },

  ry(p,k={}) {
    if(p.id === "kb") {
      return (
        (k.k ? 1 : 0) -
        (k.i ? 1 : 0)
      );
    }

    return Number(p.pad?.ry) || 0;
  },

  buttons(p) {
    return p.pad?.buttons || [];
  },

  pressed(p,name) {
    if(p.id === "kb") {
      const keys = {
        A:[" "],
        B:["Shift"],
        X:["e"],
        Y:["q"],
        START:["Enter"],
        SELECT:["Escape"],
        L1:["z"],
        R1:["r"]
      };

      return (keys[name] || []).some(key => p.keys?.[key]);
    }

    return GH.buttons(p).includes(name);
  },

  board(g,P) {
    g.save();
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.font = "700 21px Fredoka,sans-serif";

    [...P]
      .sort((a,b) => b.score-a.score)
      .forEach((p,i) => {
        const y = 30+i*29;

        g.fillStyle = "rgba(0,0,0,.35)";
        g.fillRect(12,y-12,Math.min(260,g.canvas.width*.34),24);

        g.fillStyle = p.c;
        g.fillText(
          `${i+1}. ${p.name}${p.online ? "" : " (offline)"}  ${p.score}`,
          20,
          y
        );
      });

    g.restore();
  },

  text(g,text,x,y,size=28,color="#fff",align="center") {
    g.save();
    g.fillStyle = color;
    g.font = `700 ${size}px Fredoka,sans-serif`;
    g.textAlign = align;
    g.textBaseline = "middle";
    g.fillText(String(text),x,y);
    g.restore();
  },

  rect(g,x,y,w,h,color) {
    g.fillStyle = color;
    g.fillRect(x,y,w,h);
  },

  roundRect(g,x,y,w,h,r,color) {
    g.fillStyle = color;
    g.beginPath();
    g.roundRect(x,y,w,h,r);
    g.fill();
  },

  circle(g,x,y,r,color) {
    g.fillStyle = color;
    g.beginPath();
    g.arc(x,y,r,0,Math.PI*2);
    g.fill();
  },

  line(g,x1,y1,x2,y2,color,width=2) {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.beginPath();
    g.moveTo(x1,y1);
    g.lineTo(x2,y2);
    g.stroke();
  },

  clamp(v,min,max) {
    return Math.max(min,Math.min(max,v));
  },

  random(min,max) {
    return min+Math.random()*(max-min);
  },

  gradient(g,x,y,w,h,stops) {
    const grad = g.createLinearGradient(x,y,x,y+h);
    stops.forEach((s,i) => grad.addColorStop(i/(stops.length-1),s));
    return grad;
  },

  particle(list,x,y,color,count=8,speed=180) {
    for(let i=0;i<count;i++) {
      const a = Math.random()*Math.PI*2;
      const v = GH.random(speed*.3,speed);

      list.push({
        x,y,
        vx:Math.cos(a)*v,
        vy:Math.sin(a)*v,
        life:GH.random(.25,.65),
        max:.65,
        color,
        size:GH.random(3,7)
      });
    }
  },

  updateParticles(list,dt) {
    list.forEach(p => {
      p.x += p.vx*dt;
      p.y += p.vy*dt;
      p.vy += 280*dt;
      p.life -= dt;
    });

    return list.filter(p => p.life>0);
  },

  drawParticles(g,list) {
    list.forEach(p => {
      g.globalAlpha = Math.max(0,p.life/p.max);
      GH.circle(g,p.x,p.y,p.size,p.color);
    });

    g.globalAlpha = 1;
  },

  drawCloud(g,x,y,s=1) {
    g.save();
    g.fillStyle = "rgba(255,255,255,.85)";
    g.beginPath();
    g.arc(x,y,19*s,0,Math.PI*2);
    g.arc(x+23*s,y-10*s,24*s,0,Math.PI*2);
    g.arc(x+48*s,y,18*s,0,Math.PI*2);
    g.fill();
    g.restore();
  },

  drawStar(g,x,y,r,color="#fff") {
    g.save();
    g.translate(x,y);
    g.fillStyle = color;
    g.beginPath();

    for(let i=0;i<10;i++) {
      const a = -Math.PI/2+i*Math.PI/5;
      const rr = i%2===0 ? r : r*.43;
      const px = Math.cos(a)*rr;
      const py = Math.sin(a)*rr;

      if(i===0) g.moveTo(px,py);
      else g.lineTo(px,py);
    }

    g.closePath();
    g.fill();
    g.restore();
  }
};


/* =========================================================
   CHARACTER AND ITEM DRAWING
========================================================= */

function drawHero(g,x,y,color,frame=0,facing=1,dead=false) {
  g.save();
  g.translate(x,y);
  g.scale(facing,1);

  if(dead) {
    g.globalAlpha = .45;
  }

  const bob = Math.sin(frame*10)*2;

  // Shadow
  g.fillStyle = "rgba(0,0,0,.2)";
  g.beginPath();
  g.ellipse(0,38,22,6,0,0,Math.PI*2);
  g.fill();

  // Legs
  GH.roundRect(g,-15,18+bob,12,20,4,"#27344b");
  GH.roundRect(g,3,18-bob,12,20,4,"#27344b");

  // Shoes
  GH.roundRect(g,-19,34+bob,18,9,4,"#4c2c21");
  GH.roundRect(g,1,34-bob,19,9,4,"#4c2c21");

  // Body
  GH.roundRect(g,-17,-12+bob,34,34,8,color);

  // Overalls
  GH.roundRect(g,-13,1+bob,26,22,5,"#2466bb");
  GH.circle(g,-7,5+bob,2.5,"#ffe28a");
  GH.circle(g,7,5+bob,2.5,"#ffe28a");

  // Arms
  GH.roundRect(g,-24,-8+bob,9,23,4,color);
  GH.roundRect(g,15,-8+bob,9,23,4,color);

  GH.circle(g,-20,16+bob,6,"#f1bc8d");
  GH.circle(g,20,16+bob,6,"#f1bc8d");

  // Neck
  GH.rect(g,-7,-23+bob,14,12,"#e8ae83");

  // Face
  GH.circle(g,0,-31+bob,17,"#f2c29b");

  // Hair and moustache
  GH.rect(g,-15,-37+bob,8,13,"#503020");
  GH.rect(g,8,-36+bob,8,12,"#503020");
  GH.roundRect(g,-10,-22+bob,20,6,3,"#51301f");

  // Eyes
  GH.circle(g,-6,-32+bob,2.3,"#25202a");
  GH.circle(g,7,-32+bob,2.3,"#25202a");

  // Cap
  GH.roundRect(g,-18,-53+bob,36,14,7,"#d93636");
  GH.roundRect(g,-21,-43+bob,42,7,4,"#b8202b");
  GH.circle(g,0,-48+bob,5,"#fff1dc");

  // Cap emblem
  GH.text(g,"M",0,-47+bob,7,"#c82b2b");

  g.restore();
}


function drawMushroom(g,x,y,scale=1) {
  g.save();
  g.translate(x,y);
  g.scale(scale,scale);

  // Stem
  GH.roundRect(g,-10,-1,20,21,6,"#fff0ce");
  GH.roundRect(g,-7,7,14,10,3,"#e4c79a");

  // Cap
  g.fillStyle = "#e84242";
  g.beginPath();
  g.moveTo(-20,1);
  g.bezierCurveTo(-18,-17,-10,-25,0,-25);
  g.bezierCurveTo(12,-25,20,-14,20,1);
  g.closePath();
  g.fill();

  GH.circle(g,-9,-13,5,"#fff");
  GH.circle(g,8,-16,5,"#fff");
  GH.circle(g,0,-4,4,"#fff");

  g.restore();
}


function drawFruit(g,o) {
  const {x,y,r,type,angle=0} = o;

  g.save();
  g.translate(x,y);
  g.rotate(angle);

  if(type==="apple") {
    g.fillStyle = "#e93643";
    g.beginPath();
    g.moveTo(0,-r*.65);
    g.bezierCurveTo(-r*1.1,-r*1.3,-r*1.35,-r*.2,-r*.9,r*.65);
    g.bezierCurveTo(-r*.4,r*1.2,r*.2,r*1.2,r*.9,r*.65);
    g.bezierCurveTo(r*1.35,-r*.2,r*1.1,-r*1.3,0,-r*.65);
    g.fill();

    GH.circle(g,-r*.35,-r*.2,r*.25,"rgba(255,255,255,.2)");

    GH.line(g,0,-r*.6,3,-r*1.1,"#65432a",4);

    g.fillStyle = "#4bba55";
    g.beginPath();
    g.ellipse(9,-r*.95,9,4,-.4,0,Math.PI*2);
    g.fill();
  }

  else if(type==="strawberry") {
    g.fillStyle = "#ed344e";
    g.beginPath();
    g.moveTo(0,-r*.9);
    g.bezierCurveTo(r*1.2,-r*.9,r*1.2,r*.1,0,r*1.15);
    g.bezierCurveTo(-r*1.2,r*.1,-r*1.2,-r*.9,0,-r*.9);
    g.fill();

    for(let i=0;i<7;i++) {
      GH.circle(
        g,
        Math.sin(i*2.4)*r*.55,
        -r*.45+i*r*.22,
        1.8,
        "#ffe59a"
      );
    }

    GH.line(g,-r*.4,-r*.8,0,-r*1.15,"#44a84d",4);
    GH.line(g,0,-r*1.15,r*.4,-r*.8,"#44a84d",4);
  }

  else if(type==="orange") {
    GH.circle(g,0,0,r*.85,"#ff982e");
    GH.circle(g,-r*.2,-r*.2,r*.5,"rgba(255,220,140,.18)");
    GH.circle(g,0,-r*.85,4,"#548f3b");
    GH.line(g,0,-r*.8,5,-r*1.1,"#548f3b",3);
  }

  else if(type==="watermelon") {
    GH.circle(g,0,0,r,"#258e55");

    g.beginPath();
    g.arc(0,0,r*.78,0,Math.PI*2);
    g.fillStyle = "#f34e60";
    g.fill();

    g.strokeStyle = "#b8e66a";
    g.lineWidth = 4;
    g.beginPath();
    g.arc(0,0,r*.88,0,Math.PI*2);
    g.stroke();

    for(let i=0;i<5;i++) {
      GH.circle(g,Math.sin(i*1.3)*r*.35,Math.cos(i*1.3)*r*.35,2.3,"#3b2633");
    }
  }

  else if(type==="banana") {
    g.strokeStyle = "#f7d34b";
    g.lineWidth = r*.65;
    g.lineCap = "round";
    g.beginPath();
    g.arc(0,-r*.15,r*.75,.2,Math.PI-.2);
    g.stroke();

    GH.circle(g,-r*.7,r*.25,3,"#74502c");
    GH.circle(g,r*.7,r*.25,3,"#74502c");
  }

  else if(type==="bomb") {
    GH.circle(g,0,0,r*.9,"#272b34");
    GH.circle(g,-r*.25,-r*.25,r*.3,"#555d69");

    GH.line(g,0,-r*.8,8,-r*1.3,"#d6a36a",5);
    GH.drawStar(g,10,-r*1.3,7,"#ffdb55");

    GH.text(g,"!",0,3,r*.9,"#fff");
  }

  g.restore();
}


/* =========================================================
   GAMES
========================================================= */

const GAMES = {


/* ---------------------------------------------------------
   1. MOTION RACER
   Special game loop handled by index.html.
--------------------------------------------------------- */

racer: {
  name:"Motion Racer",
  icon:"🏎️",
  c:"#ff5d5d",
  desc:"Dodge cones and grab coins.",
  help:"Tilt or use the left stick to steer. Keyboard: arrows.",
  dur:45
},


/* ---------------------------------------------------------
   2. MOTION TARGET
--------------------------------------------------------- */

target: {
  name:"Motion Target",
  icon:"🎯",
  c:"#2ec4b6",
  desc:"Aim and hit moving targets.",
  help:"Right stick or mouse to aim. Press A or X to shoot.",
  dur:40,

  init(P,env) {
    this.t = [];
    this.particles = [];

    P.forEach(p => {
      p.cx = env.W/2;
      p.cy = env.H/2;
      p.fire = 0;
    });
  },

  update(dt,now,left,P,env) {
    const {W,H} = env;

    while(this.t.length<7) {
      const k = Math.random();
      const b = k<.45 ? 0 : k<.8 ? 1 : 2;
      const r = [58,38,24][b];

      this.t.push({
        x:GH.random(r,W-r),
        y:GH.random(120,H-r),
        r,
        pts:[10,25,50][b],
        vx:GH.random(-1,1)*[90,180,320][b],
        vy:GH.random(-1,1)*[60,120,220][b],
        age:0,
        phase:Math.random()*6
      });
    }

    this.t.forEach(o => {
      o.x += o.vx*dt;
      o.y += o.vy*dt;
      o.age += dt;
      o.phase += dt;

      if(o.x<o.r || o.x>W-o.r) o.vx *= -1;
      if(o.y<100+o.r || o.y>H-o.r) o.vy *= -1;
    });

    this.t = this.t.filter(o => o.age<9);

    P.forEach(p => {
      if(p.id==="kb") {
        p.cx = env.mouse.x;
        p.cy = env.mouse.y;
      } else {
        const rx = GH.rx(p);
        const ry = GH.ry(p);

        p.cx = GH.clamp(p.cx+rx*W*dt*1.8,0,W);
        p.cy = GH.clamp(p.cy+ry*H*dt*1.8,0,H);
      }

      const shoot =
        p.fire ||
        GH.pressed(p,"A") ||
        GH.pressed(p,"X");

      if(shoot) {
        p.fire = 0;
        p.fl = .15;

        const i = this.t.findIndex(o =>
          Math.hypot(o.x-p.cx,o.y-p.cy)<=o.r
        );

        if(i>=0) {
          p.score += this.t[i].pts;
          GH.particle(this.particles,this.t[i].x,this.t[i].y,"#ffe36b",10);
          this.t.splice(i,1);
          Sfx.play("hit");
        } else {
          Sfx.play("out");
        }
      }

      p.fl = Math.max(0,(p.fl||0)-dt);
    });

    this.particles = GH.updateParticles(this.particles,dt);
  },

  draw(g,W,H,P) {
    GH.rect(g,0,0,W,H,"#102f3b");

    for(let i=0;i<25;i++) {
      GH.circle(g,(i*137)%W,(i*89)%H,2,"#285366");
    }

    this.t.forEach(o => {
      const pulse = 1+Math.sin(o.phase*5)*.07;

      GH.circle(g,o.x,o.y,o.r*pulse,"#f45b62");
      GH.circle(g,o.x,o.y,o.r*.7*pulse,"#fff");
      GH.circle(g,o.x,o.y,o.r*.4*pulse,"#f45b62");

      GH.text(g,o.pts,o.x,o.y+5,16,"#fff");
    });

    GH.drawParticles(g,this.particles);

    P.forEach(p => {
      g.strokeStyle = p.c;
      g.lineWidth = p.fl ? 6 : 3;

      const r = p.fl ? 30 : 20;

      g.beginPath();
      g.arc(p.cx,p.cy,r,0,Math.PI*2);
      g.moveTo(p.cx-r-10,p.cy);
      g.lineTo(p.cx+r+10,p.cy);
      g.moveTo(p.cx,p.cy-r-10);
      g.lineTo(p.cx,p.cy+r+10);
      g.stroke();
    });

    GH.board(g,P);
  },

  over() {
    return false;
  }
},


/* ---------------------------------------------------------
   3. BALANCE CHALLENGE
--------------------------------------------------------- */

balance: {
  name:"Balance Challenge",
  icon:"⚖️",
  c:"#ffd23f",
  desc:"Keep your ball on the beam. Last one standing wins.",
  help:"Tilt or move the left stick to balance.",
  dur:180,

  init(P) {
    this.el = 0;
    this.w = 0;
    this.n = 1;

    P.forEach(p => {
      p.bx = 0;
      p.bv = 0;
      p.alive = true;
      p.score = 0;
    });
  },

  edge() {
    return Math.max(.45,1-this.el/120);
  },

  update(dt,now,left,P,env) {
    this.el += dt;

    const d = 1+this.el/20;
    this.n -= dt;

    if(this.n<=0) {
      this.w = (Math.random()<.5 ? -1 : 1)*(.5+.15*d);
      this.n = (1.5+Math.random()*2)/Math.sqrt(d);
    }

    this.w *= Math.pow(.4,dt);

    P.forEach(p => {
      if(!p.alive) return;

      const s = GH.sx(p,env.keys);

      p.bv += (
        s*2.5+
        this.w*2+
        p.bx*.8+
        Math.sin(this.el*.7+(p.n||0))*.15*d
      )*dt;

      p.bv *= Math.pow(.05,dt);
      p.bx += p.bv*dt;
      p.score = Math.round(this.el*10);

      if(Math.abs(p.bx)>this.edge()) {
        p.alive = false;
        Sfx.play("out");
      }
    });
  },

  draw(g,W,H,P) {
    GH.rect(g,0,0,W,H,"#242016");

    const w = W/P.length;

    P.forEach((p,i) => {
      const cx = i*w+w/2;
      const hw = w*.4;
      const e = this.edge();

      GH.roundRect(g,cx-hw*e,H*.7,hw*2*e,18,8,"#8a6b35");
      GH.rect(g,cx-hw*e,H*.7,hw*2*e,4,"#e8c66a");

      GH.circle(
        g,
        cx+p.bx*hw,
        H*.7-23,
        22,
        p.alive?p.c:"#555"
      );

      GH.circle(g,cx+p.bx*hw-6,H*.7-30,5,"rgba(255,255,255,.5)");

      GH.text(g,`P${p.n} ${p.name}`,cx,H*.3,25,p.c);

      GH.text(
        g,
        p.alive ? (p.score/10).toFixed(1)+"s" : "OUT",
        cx,
        H*.3+40,
        22
      );
    });

    GH.text(
      g,
      this.w>.2 ? "WIND →" : this.w<-.2 ? "← WIND" : "STEADY",
      W/2,
      90,
      28,
      "#fff"
    );
  },

  over(P) {
    return P.filter(p=>p.alive).length <= (P.length>1?1:0);
  }
},


/* ---------------------------------------------------------
   4. REACTION CHALLENGE
--------------------------------------------------------- */

reaction: {
  name:"Reaction Challenge",
  icon:"⚡",
  c:"#9b7bff",
  desc:"Wait for green, then react as fast as possible.",
  help:"Press A or X when the screen turns green. Do not press early.",
  dur:9999,

  hud() {
    return `Round ${Math.min(this.round+1,5)}/5`;
  },

  nr(P) {
    this.t = 1.5+Math.random()*2.5;
    this.st = "wait";
    this.first = 1;

    P.forEach(p => {
      p.rtv = null;
      p.fs = 0;
      p.fire = 0;
      p.rep = 0;
      p.msg = "";
    });
  },

  init(P) {
    this.round = 0;
    this.done = 0;
    this.nr(P);
  },

  update(dt,now,left,P,env) {
    const pressed = p =>
      p.fire ||
      GH.pressed(p,"A") ||
      GH.pressed(p,"X");

    if(this.st==="wait") {
      this.t -= dt;

      P.forEach(p => {
        if(pressed(p)) {
          p.fire = 0;

          if(!p.fs) {
            p.fs = 1;
            p.score -= 300;
            p.msg = "False start -300";
            Sfx.play("out");
          }
        }
      });

      if(this.t<=0) {
        this.st = "go";
        this.goAt = now;

        P.forEach(p => p.fire=0);

        env.send("go",{r:this.round});
        Sfx.play("count");
      }
    }

    else if(this.st==="go") {
      const h = now-this.goAt;

      P.forEach(p => {
        if(pressed(p) && !p.fs && p.rtv==null) {
          const rt = Math.max(
            100,
            Math.round(p.rep ? Math.min(p.rep,h) : h)
          );

          p.rtv = rt;

          let s = Math.max(0,1000-rt);

          if(this.first) {
            s += 200;
            this.first = 0;
          }

          p.score += s;
          p.msg = rt+" ms";
          Sfx.play("point");
        }

        p.fire = 0;
      });

      if(P.every(p=>p.fs || p.rtv!=null) || h>2500) {
        P.forEach(p => {
          if(!p.fs && p.rtv==null) p.msg = "No response";
        });

        this.st = "show";
        this.t = 2.2;
      }
    }

    else {
      this.t -= dt;

      if(this.t<=0) {
        this.round++;

        if(this.round>=5) this.done=1;
        else this.nr(P);
      }
    }
  },

  draw(g,W,H,P) {
    const bg = this.st==="wait"
      ? "#b3261e"
      : this.st==="go"
        ? "#159b50"
        : "#241c3f";

    GH.rect(g,0,0,W,H,bg);

    if(this.st==="go") {
      for(let i=0;i<16;i++) {
        GH.drawStar(
          g,
          (i*139)%W,
          (i*83)%H,
          8,
          "rgba(255,255,255,.3)"
        );
      }
    }

    if(this.st!=="show") {
      GH.text(
        g,
        this.st==="wait" ? "WAIT..." : "PRESS!",
        W/2,
        H*.5,
        Math.min(W*.12,120)
      );

      GH.text(
        g,
        this.st==="wait" ? "Don't jump the gun" : "NOW!",
        W/2,
        H*.5+75,
        24,
        "#fff"
      );
    } else {
      P.forEach((p,i) => {
        GH.text(g,`${p.name}: ${p.msg}`,W/2,H*.35+i*50,30,p.c);
      });
    }

    GH.board(g,P);
  },

  over() {
    return this.done;
  }
},


/* ---------------------------------------------------------
   5. FRUIT SLASH
--------------------------------------------------------- */

fruit: {
  name:"Fruit Slash",
  icon:"🍉",
  c:"#ff6b6b",
  desc:"Slash fruit before they fall. Avoid bombs.",
  help:"Right stick or mouse to aim. Press A, X or R1 to slash.",
  dur:50,

  init(P,env) {
    this.items = [];
    this.spawn = .5;
    this.particles = [];
    this.elapsed = 0;

    P.forEach(p => {
      p.slashCooldown = 0;
      p.combo = 0;
      p.sx = env.W/2;
      p.sy = env.H/2;
      p.trail = [];
    });
  },

  update(dt,now,left,P,env) {
    const {W,H} = env;

    this.elapsed += dt;
    this.spawn -= dt;

    if(this.spawn<=0) {
      this.spawn = Math.max(.32,.8-this.elapsed*.005);

      const bomb = Math.random()<.16;
      const types = ["apple","strawberry","orange","watermelon","banana"];

      this.items.push({
        x:GH.random(70,W-70),
        y:H+45,
        vx:GH.random(-130,130),
        vy:GH.random(-850,-590),
        r:bomb?25:GH.random(23,31),
        type:bomb?"bomb":types[Math.floor(Math.random()*types.length)],
        angle:GH.random(-.4,.4),
        spin:GH.random(-2,2),
        alive:true
      });
    }

    this.items.forEach(o => {
      o.x += o.vx*dt;
      o.y += o.vy*dt;
      o.vy += 720*dt;
      o.angle += o.spin*dt;

      if(o.y>H+100) o.alive=false;
    });

    P.forEach(p => {
      if(p.id==="kb") {
        p.sx = env.mouse.x;
        p.sy = env.mouse.y;
      } else {
        p.sx = GH.clamp(p.sx+GH.rx(p)*W*dt*1.8,0,W);
        p.sy = GH.clamp(p.sy+GH.ry(p)*H*dt*1.8,0,H);
      }

      p.slashCooldown = Math.max(0,p.slashCooldown-dt);

      p.trail.unshift({x:p.sx,y:p.sy,life:.22});
      p.trail = p.trail.slice(0,7);

      p.trail.forEach(t => t.life-=dt);
      p.trail = p.trail.filter(t=>t.life>0);

      const attack =
        p.fire ||
        GH.pressed(p,"A") ||
        GH.pressed(p,"X") ||
        GH.pressed(p,"R1");

      if(attack && p.slashCooldown<=0) {
        p.fire=0;
        p.slashCooldown=.22;

        let hit=false;

        this.items.forEach(o => {
          if(!o.alive) return;

          const d = Math.hypot(o.x-p.sx,o.y-p.sy);

          if(d<o.r+65) {
            o.alive=false;
            hit=true;

            if(o.type==="bomb") {
              p.score=Math.max(0,p.score-100);
              p.combo=0;
              Sfx.play("out");

              GH.particle(this.particles,o.x,o.y,"#ff8c38",20,280);
            } else {
              p.combo++;
              p.score += 10*p.combo;
              Sfx.play("hit");

              GH.particle(
                this.particles,
                o.x,o.y,
                ["#ff5b66","#ffd447","#8ee36e","#fff"][Math.floor(Math.random()*4)],
                14,
                230
              );
            }
          }
        });

        if(!hit) p.combo=0;
      }
    });

    this.items=this.items.filter(o=>o.alive);
    this.particles=GH.updateParticles(this.particles,dt);
  },

  draw(g,W,H,P) {
    const bg = GH.gradient(g,0,0,W,H,["#102e3b","#193d45","#101f31"]);
    GH.rect(g,0,0,W,H,bg);

    for(let i=0;i<24;i++) {
      GH.circle(g,(i*137)%W,(i*89)%H,2,"#315664");
    }

    // Decorative floor
    GH.rect(g,0,H-12,W,12,"#254c4b");

    this.items.forEach(o => drawFruit(g,o));

    GH.drawParticles(g,this.particles);

    P.forEach(p => {
      // Slash trail
      p.trail.forEach((t,i) => {
        g.globalAlpha = Math.max(0,t.life/.22)*.65;
        g.strokeStyle = p.c;
        g.lineWidth = 3+i*.7;
        g.beginPath();
        g.arc(t.x,t.y,4+i*2,0,Math.PI*2);
        g.stroke();
      });

      g.globalAlpha=1;

      g.strokeStyle=p.c;
      g.lineWidth=4;
      g.beginPath();
      g.arc(p.sx,p.sy,27,0,Math.PI*2);
      g.stroke();

      GH.text(g,p.combo?"x"+p.combo:"",p.sx,p.sy-43,20,p.c);
    });

    GH.board(g,P);
  },

  over() {
    return false;
  }
},


/* ---------------------------------------------------------
   6. MARIO
   Original side-scrolling mushroom platform game.
--------------------------------------------------------- */

platform: {
  name:"Mario",
  icon:"🍄",
  c:"#5be7a9",
  desc:"Jump across platforms, collect mushrooms and avoid hazards.",
  help:"Left stick: move. A or X: jump. B: dash.",
  dur:60,

  init(P,env) {
    this.world=0;
    this.ground=env.H-88;
    this.platforms=[];
    this.mushrooms=[];
    this.hazards=[];
    this.particles=[];
    this.elapsed=0;
    this.finishX=14500;

    // Ground-level pipes
    this.pipes=[];

    for(let i=0;i<24;i++) {
      this.pipes.push({
        x:650+i*570,
        w:55,
        h:GH.random(55,95)
      });
    }

    // Platforms
    this.platforms.push({
      x:260,y:this.ground-115,w:150,h:16
    });

    for(let i=0;i<90;i++) {
      const x=500+i*155;

      this.platforms.push({
        x,
        y:this.ground-GH.random(90,230),
        w:GH.random(105,165),
        h:17
      });
    }

    // Mushroom collectibles
    for(let i=0;i<100;i++) {
      const x=300+i*135;

      this.mushrooms.push({
        x,
        y:this.ground-GH.random(110,260),
        got:false,
        phase:Math.random()*6
      });
    }

    // Hazards
    for(let i=0;i<42;i++) {
      this.hazards.push({
        x:900+i*315,
        y:this.ground-23,
        w:34,
        h:23
      });
    }

    P.forEach((p,i) => {
      p.px=90+i*45;
      p.py=this.ground-45;
      p.pvx=0;
      p.pvy=0;
      p.pground=false;
      p.pdead=false;
      p.prespawn=0;
      p.pface=1;
      p.pframe=0;
      p.pinv=0;
      p.pjumps=0;
    });
  },

  update(dt,now,left,P,env) {
    const {W,H}=env;

    this.elapsed+=dt;

    P.forEach(p => {
      if(p.pdead) {
        p.prespawn-=dt;

        if(p.prespawn<=0) {
          p.pdead=false;
          p.px=Math.max(this.world+70,90);
          p.py=this.ground-45;
          p.pvx=0;
          p.pvy=0;
          p.pinv=1.3;
        }

        return;
      }

      p.pinv=Math.max(0,p.pinv-dt);
      p.pframe+=dt;

      const move=GH.sx(p,env.keys);

      const jump =
        p.fire ||
        GH.pressed(p,"A") ||
        GH.pressed(p,"X");

      const dash=GH.pressed(p,"B");

      if(move!==0) p.pface=move>0?1:-1;

      p.pvx+=move*1250*dt;
      p.pvx*=Math.pow(.035,dt);
      p.pvx=GH.clamp(p.pvx,-390,390);

      if(dash) {
        p.pvx=p.pface*600;
      }

      if(jump && p.pground) {
        p.pvy=-680;
        p.pground=false;
        p.pjumps=1;
        Sfx.play("hit");
      }

      p.fire=0;

      const oldX=p.px;
      const oldY=p.py;

      p.pvy+=1550*dt;
      p.px+=p.pvx*dt;
      p.py+=p.pvy*dt;

      p.pground=false;

      // Main ground collision
      if(p.py+39>=this.ground && p.pvy>=0) {
        p.py=this.ground-39;
        p.pvy=0;
        p.pground=true;
      }

      // Platform landing collision.
      // Only land when descending through the top surface.
      if(p.pvy>=0) {
        this.platforms.forEach(o => {
          const horizontal =
            p.px+16>o.x &&
            p.px-16<o.x+o.w;

          const crossedTop =
            oldY+39<=o.y &&
            p.py+39>=o.y;

          if(horizontal && crossedTop) {
            p.py=o.y-39;
            p.pvy=0;
            p.pground=true;
          }
        });
      }

      // Pipe collision
      this.pipes.forEach(o => {
        const top=this.ground-o.h;

        if(
          p.px+16>o.x &&
          p.px-16<o.x+o.w &&
          p.py+39>top &&
          p.py+39<this.ground+5
        ) {
          if(oldX<p.px && p.px<o.x+o.w) {
            p.px=o.x-18;
            p.pvx=0;
          }
        }
      });

      // Mushroom collection
      this.mushrooms.forEach(o => {
        if(o.got) return;

        o.phase+=dt;

        if(Math.hypot(p.px-o.x,p.py-o.y)<48) {
          o.got=true;
          p.score+=50;
          Sfx.play("point");

          GH.particle(
            this.particles,
            o.x-this.world,
            o.y,
            "#ffe46a",
            12,
            180
          );
        }
      });

      // Hazard collision
      this.hazards.forEach(o => {
        if(
          Math.abs(p.px-o.x)<34 &&
          Math.abs(p.py-(this.ground-25))<44 &&
          p.pinv<=0
        ) {
          p.pdead=true;
          p.prespawn=1.2;
          p.score=Math.max(0,p.score-50);
          Sfx.play("out");
        }
      });

      if(p.py>H+150) {
        p.pdead=true;
        p.prespawn=1.2;
        p.score=Math.max(0,p.score-50);
      }

      // Progress score
      p.score+=Math.max(0,Math.round(Math.abs(p.pvx)*dt*.015));

      // Shared camera follows the average active player position
    });

    const active=P.filter(p=>!p.pdead);

    if(active.length) {
      const average=active.reduce((sum,p)=>sum+p.px,0)/active.length;
      this.world=GH.clamp(average-W*.35,0,this.finishX-W*.8);
    }

    this.particles=GH.updateParticles(this.particles,dt);
  },

  draw(g,W,H,P) {
    const world=this.world;

    // Sky
    GH.rect(g,0,0,W,H,"#69c8f2");

    // Distant hills
    for(let i=0;i<9;i++) {
      const x=(i*260-world*.18%260+W)%W;

      g.fillStyle="#73b978";
      g.beginPath();
      g.arc(x,H-65,95,Math.PI,Math.PI*2);
      g.fill();

      g.fillStyle="#a4d98b";
      g.beginPath();
      g.arc(x+25,H-62,48,Math.PI,Math.PI*2);
      g.fill();
    }

    // Clouds
    for(let i=0;i<8;i++) {
      const x=(i*260-world*.25%260+W)%W;
      GH.drawCloud(g,x,90+(i%3)*55,.8+(i%2)*.2);
    }

    // Ground
    GH.rect(g,0,this.ground,W,H-this.ground,"#3c9a4e");
    GH.rect(g,0,this.ground,W,10,"#75d65e");

    for(let i=0;i<35;i++) {
      const x=(i*80-world%80+W)%W;
      GH.rect(g,x,this.ground+20,4,16,"#286b3d");
    }

    // Brick platforms
    this.platforms.forEach(o => {
      const x=o.x-world;

      if(x+o.w<0 || x>W) return;

      GH.roundRect(g,x,o.y,o.w,o.h,4,"#a76537");
      GH.rect(g,x,o.y,o.w,5,"#68d65c");

      for(let bx=0;bx<o.w;bx+=35) {
        GH.line(g,x+bx,o.y+5,x+bx,o.y+o.h,"#754326",2);
      }
    });

    // Pipes
    this.pipes.forEach(o => {
      const x=o.x-world;

      if(x+o.w<0 || x>W) return;

      GH.roundRect(g,x,this.ground-o.h,o.w,o.h,5,"#159b50");
      GH.roundRect(g,x-6,this.ground-o.h,o.w+12,17,5,"#32bd61");
      GH.line(g,x+12,this.ground-o.h+20,x+12,this.ground-8,"#75e68c",4);
    });

    // Mushrooms
    this.mushrooms.forEach(o => {
      if(o.got) return;

      const x=o.x-world;

      if(x<-40 || x>W+40) return;

      const bob=Math.sin(o.phase*4)*4;
      drawMushroom(g,x,o.y+bob,.8);
    });

    // Spikes
    this.hazards.forEach(o => {
      const x=o.x-world;

      if(x<-50 || x>W+50) return;

      g.fillStyle="#e74d55";
      g.beginPath();
      g.moveTo(x-o.w/2,this.ground);
      g.lineTo(x,this.ground-o.h);
      g.lineTo(x+o.w/2,this.ground);
      g.closePath();
      g.fill();

      GH.line(g,x,this.ground-8,x,this.ground-20,"#ffb2a8",3);
    });

    // Finish marker
    const finish=this.finishX-world;

    if(finish<W+100) {
      GH.rect(g,finish,this.ground-180,8,180,"#fff");
      GH.rect(g,finish+8,this.ground-180,55,35,"#e94343");
      GH.rect(g,finish+8,this.ground-145,55,35,"#fff");
      GH.text(g,"FINISH",finish+35,this.ground-205,20,"#fff");
    }

    // Players
    P.forEach(p => {
      const x=p.px-world;

      if(p.pdead || x<-100 || x>W+100) return;

      g.save();

      if(p.pinv>0 && Math.floor(p.pinv*12)%2) {
        g.globalAlpha=.45;
      }

      drawHero(
        g,
        x,
        p.py,
        p.c,
        p.pframe,
        p.pface
      );

      GH.text(g,p.name,x,p.py-70,16,p.c);

      g.restore();
    });

    GH.drawParticles(g,this.particles);

    GH.roundRect(g,W-190,12,170,38,12,"rgba(0,0,0,.35)");
    GH.text(g,"MUSHROOMS",W-105,30,15,"#fff");

    GH.board(g,P);
  },

  over() {
    return false;
  }
},


/* ---------------------------------------------------------
   7. ARENA CLASH
--------------------------------------------------------- */

fighter: {
  name:"Arena Clash",
  icon:"🥊",
  c:"#ff9f43",
  desc:"Fight other players in a multiplayer arena.",
  help:"Left stick moves. A punches. B kicks. X blocks. Y special.",
  dur:75,

  init(P,env) {
    this.floor=env.H-100;
    this.particles=[];

    P.forEach((p,i) => {
      p.fx=env.W*(i+1)/(P.length+1);
      p.fy=this.floor;
      p.facing=i<P.length/2?1:-1;
      p.health=100;
      p.attackCooldown=0;
      p.hitCooldown=0;
      p.attack="";
      p.attackTime=0;
      p.blocking=false;
      p.alive=true;
    });
  },

  update(dt,now,left,P,env) {
    P.forEach(p => {
      if(!p.alive) return;

      p.attackCooldown=Math.max(0,p.attackCooldown-dt);
      p.hitCooldown=Math.max(0,p.hitCooldown-dt);
      p.attackTime=Math.max(0,p.attackTime-dt);

      const move=GH.sx(p,env.keys);

      p.fx+=move*280*dt;
      p.fx=GH.clamp(p.fx,35,env.W-35);

      p.blocking=
        GH.pressed(p,"X") ||
        GH.pressed(p,"L1");

      if(p.attackTime<=0) p.attack="";

      let type="";

      if(GH.pressed(p,"A") || p.fire) type="punch";
      if(GH.pressed(p,"B")) type="kick";
      if(GH.pressed(p,"Y")) type="special";

      if(type && p.attackCooldown<=0) {
        p.attack=type;
        p.attackTime=.22;
        p.attackCooldown=type==="special"?1.2:.45;
        p.fire=0;

        Sfx.play("hit");

        P.forEach(target => {
          if(target===p || !target.alive) return;

          const distance=Math.abs(target.fx-p.fx);
          const inFront=Math.sign(target.fx-p.fx)===p.facing;

          if(distance<105 && inFront && target.hitCooldown<=0) {
            if(target.blocking) {
              target.health-=type==="special"?4:1;
            } else {
              target.health-=
                type==="punch"?10:
                type==="kick"?16:25;

              target.fx+=p.facing*35;
              target.hitCooldown=.45;
            }

            target.health=Math.max(0,target.health);

            GH.particle(
              this.particles,
              target.fx,
              target.fy-55,
              target.c,
              8,
              160
            );

            if(target.health<=0) {
              target.alive=false;
              p.score+=100;
              Sfx.play("out");
            } else {
              p.score+=10;
            }
          }
        });
      }

      const opponents=P.filter(q=>q!==p && q.alive);

      if(opponents.length) {
        const nearest=opponents.reduce((a,b) =>
          Math.abs(a.fx-p.fx)<Math.abs(b.fx-p.fx)?a:b
        );

        p.facing=nearest.fx>p.fx?1:-1;
      }
    });

    this.particles=GH.updateParticles(this.particles,dt);
  },

  draw(g,W,H,P) {
    GH.rect(g,0,0,W,H,"#211d35");

    // Arena lights
    for(let i=0;i<12;i++) {
      GH.circle(g,i*120+40,100+(i%3)*25,25,"#38304e");
    }

    GH.rect(g,0,this.floor,W,H-this.floor,"#493a55");
    GH.rect(g,0,this.floor,W,8,"#d5a34c");

    // Floor markings
    for(let i=0;i<15;i++) {
      GH.line(g,i*100,this.floor+35,i*100+50,this.floor+35,"#6d586e",3);
    }

    P.forEach(p => {
      const x=p.fx;
      const y=p.fy;

      g.save();
      g.translate(x,y);
      g.scale(p.facing,1);

      // Legs
      GH.roundRect(g,-20,-18,15,20,4,"#20243b");
      GH.roundRect(g,5,-18,15,20,4,"#20243b");

      // Body
      GH.roundRect(g,-22,-65,44,48,8,p.alive?p.c:"#555");
      GH.circle(g,0,-78,20,"#f1c5a2");

      GH.circle(g,-7,-80,2.5,"#222");
      GH.circle(g,7,-80,2.5,"#222");

      // Arms
      GH.roundRect(g,-29,-58,10,35,5,p.c);
      GH.roundRect(g,19,-58,10,35,5,p.c);

      if(p.attackTime>0) {
        const armX=p.attack==="special"?100:55;

        GH.roundRect(
          g,
          18,-57,
          armX,
          13,
          6,
          p.attack==="special"?"#ffd43b":"#fff"
        );
      }

      g.restore();

      if(p.blocking) {
        g.strokeStyle="#7ce7ff";
        g.lineWidth=6;
        g.beginPath();
        g.arc(x,y-55,43,-1.3,1.3);
        g.stroke();
      }

      GH.text(g,p.name,x,y-112,17,p.c);

      GH.roundRect(g,x-35,y-105,70,8,4,"#5a2730");
      GH.roundRect(g,x-35,y-105,70*(p.health/100),8,4,"#5be18b");

      if(!p.alive) {
        GH.text(g,"K.O.",x,y-140,28,"#ff5d5d");
      }
    });

    GH.drawParticles(g,this.particles);
    GH.board(g,P);
  },

  over(P) {
    return P.filter(p=>p.alive).length<=1;
  }
},


/* ---------------------------------------------------------
   8. NEON RACER
--------------------------------------------------------- */

neon: {
  name:"Neon Racer",
  icon:"🏁",
  c:"#4dd0e1",
  desc:"Race through traffic and avoid incoming cars.",
  help:"Left stick steers. A or X activates boost.",
  dur:60,

  init(P,env) {
    this.traffic=[];
    this.lines=[];
    this.speed=430;
    this.spawn=0;
    this.elapsed=0;

    for(let i=0;i<14;i++) this.lines.push(i*90);

    P.forEach((p,i) => {
      p.nx=env.W*(i+1)/(P.length+1);
      p.ny=env.H*.75;
      p.nboost=0;
      p.ninv=0;
      p.nhits=0;
    });
  },

  update(dt,now,left,P,env) {
    const {W,H}=env;

    this.elapsed+=dt;
    this.spawn-=dt;

    const roadW=Math.min(W*.8,700);
    const roadX=(W-roadW)/2;

    if(this.spawn<=0) {
      this.spawn=Math.max(.35,.9-this.elapsed*.008);

      this.traffic.push({
        x:GH.random(roadX+70,roadX+roadW-70),
        y:-100,
        w:45,
        h:75,
        speed:GH.random(220,380),
        color:["#e65a5a","#e8b94c","#6d8df0"][Math.floor(Math.random()*3)]
      });
    }

    this.traffic.forEach(o => {
      o.y+=(this.speed*.55+o.speed)*dt;
    });

    this.traffic=this.traffic.filter(o=>o.y<H+120);

    this.lines=this.lines.map(y=>{
      y+=this.speed*dt;
      return y>H?y-H:y;
    });

    P.forEach(p => {
      const steer=GH.sx(p,env.keys);

      const boost=
        GH.pressed(p,"A") ||
        GH.pressed(p,"X");

      p.nboost=Math.max(0,p.nboost-dt);
      p.ninv=Math.max(0,p.ninv-dt);

      if(boost && p.nboost<=0) {
        p.nboost=1.2;
        p.score+=5;
      }

      const speedFactor=p.nboost>0?1.8:1;

      p.nx+=steer*420*dt*speedFactor;

      p.nx=GH.clamp(
        p.nx,
        roadX+35,
        roadX+roadW-35
      );

      this.traffic.forEach(o => {
        if(
          Math.abs(o.x-p.nx)<55 &&
          Math.abs(o.y-p.ny)<65 &&
          p.ninv<=0
        ) {
          p.score=Math.max(0,p.score-50);
          p.nhits++;
          p.ninv=1.5;
          Sfx.play("out");
        }
      });

      p.score+=Math.round(dt*10*speedFactor);
    });
  },

  draw(g,W,H,P) {
    const roadW=Math.min(W*.8,700);
    const roadX=(W-roadW)/2;

    GH.rect(g,0,0,W,H,"#1b332b");
    GH.rect(g,roadX,0,roadW,H,"#343a49");

    GH.rect(g,roadX,0,8,H,"#f7d354");
    GH.rect(g,roadX+roadW-8,0,8,H,"#f7d354");

    // Road lane markings
    this.lines.forEach(y => {
      GH.rect(g,roadX+roadW/3-3,y,6,45,"#e9edf5");
      GH.rect(g,roadX+roadW*2/3-3,y,6,45,"#e9edf5");
    });

    this.traffic.forEach(o => {
      GH.roundRect(g,o.x-o.w/2,o.y-o.h/2,o.w,o.h,9,o.color);
      GH.roundRect(g,o.x-o.w/2+7,o.y-o.h/2+10,o.w-14,17,4,"#a9e8f5");
      GH.rect(g,o.x-o.w/2+5,o.y+o.h/2-12,8,8,"#151922");
      GH.rect(g,o.x+o.w/2-13,o.y+o.h/2-12,8,8,"#151922");
    });

    P.forEach(p => {
      const color=p.ninv>0 && Math.floor(p.ninv*12)%2?"#fff":p.c;

      GH.roundRect(g,p.nx-23,p.ny-38,46,76,10,color);
      GH.roundRect(g,p.nx-15,p.ny-28,30,17,4,"#a9e8f5");
      GH.rect(g,p.nx-15,p.ny+12,30,14,"#1c2638");

      GH.rect(g,p.nx-25,p.ny-28,7,17,"#171c27");
      GH.rect(g,p.nx+18,p.ny-28,7,17,"#171c27");
      GH.rect(g,p.nx-25,p.ny+20,7,17,"#171c27");
      GH.rect(g,p.nx+18,p.ny+20,7,17,"#171c27");

      if(p.nboost>0) {
        GH.text(g,"BOOST",p.nx,p.ny+58,16,"#ffd43b");
      }

      GH.text(g,p.name,p.nx,p.ny-52,16,p.c);
    });

    GH.board(g,P);
  },

  over() {
    return false;
  }
}

};

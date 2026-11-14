
"use strict";

/*
  MOTIONPLAY GAME REGISTRY

  Controller input:
  p.pad.x       Left stick horizontal (-1 to 1)
  p.pad.y       Left stick vertical (-1 to 1)
  p.pad.rx      Right stick horizontal (-1 to 1)
  p.pad.ry      Right stick vertical (-1 to 1)
  p.pad.buttons Array of pressed buttons:
                "A", "B", "X", "Y", "L1", "L2",
                "R1", "R2", "START", "SELECT"

  Existing input retained:
  p.in.s        Phone tilt horizontal
  p.in.y        Phone tilt vertical
  p.fire        Existing fire input

  Game interface:
  meta + init(P,env) + update(dt,now,left,P,env)
       + draw(g,W,H,P,left,env) + over(P)

  Motion Racer is handled specially by index.html.
*/

const GH = {
  sx(p,k) {
    if (p.id === "kb") {
      return (
        (k.ArrowRight || k.d ? 1 : 0) -
        (k.ArrowLeft || k.a ? 1 : 0)
      );
    }

    const pad = p.pad || {};
    const stick = Number(pad.x) || 0;

    return Math.abs(stick) > 0.12 ? stick : (p.in?.s || 0);
  },

  sy(p,k) {
    if (p.id === "kb") {
      return (
        (k.ArrowDown || k.s ? 1 : 0) -
        (k.ArrowUp || k.w ? 1 : 0)
      );
    }

    const pad = p.pad || {};
    const stick = Number(pad.y) || 0;

    return Math.abs(stick) > 0.12 ? stick : (p.in?.y || 0);
  },

  buttons(p) {
    return p.pad?.buttons || [];
  },

  pressed(p,name) {
    return GH.buttons(p).includes(name);
  },

  board(g,P) {
    g.textAlign = "left";
    g.font = "700 24px Fredoka,sans-serif";

    [...P]
      .sort((a,b) => b.score - a.score)
      .forEach((p,i) => {
        g.fillStyle = p.c;
        g.fillText(
          `${i+1}. ${p.name}${p.online ? "" : " (offline)"}  ${p.score}`,
          20,
          38 + i * 29
        );
      });
  },

  text(g,text,x,y,size=28,color="#fff",align="center") {
    g.fillStyle = color;
    g.font = `700 ${size}px Fredoka,sans-serif`;
    g.textAlign = align;
    g.fillText(text,x,y);
  },

  rect(g,x,y,w,h,color) {
    g.fillStyle = color;
    g.fillRect(x,y,w,h);
  },

  circle(g,x,y,r,color) {
    g.fillStyle = color;
    g.beginPath();
    g.arc(x,y,r,0,Math.PI*2);
    g.fill();
  },

  clamp(v,min,max) {
    return Math.max(min,Math.min(max,v));
  },

  random(min,max) {
    return min + Math.random() * (max-min);
  }
};


const GAMES = {

/* ---------------------------------------------------------
   1. MOTION RACER
   Special game loop is handled in index.html.
--------------------------------------------------------- */

racer: {
  name:"Motion Racer",
  icon:"🏎️",
  c:"#ff5d5d",
  desc:"Dodge cones and grab coins.",
  help:"Tilt or use the left stick to steer. Keyboard: ← →",
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
  help:"Tilt or use the sticks to aim. Press A or FIRE to shoot.",
  dur:40,

  init(P,env) {
    this.t = [];

    P.forEach(p => {
      p.cx = env.W/2;
      p.cy = env.H/2;
      p.fire = 0;
    });
  },

  update(dt,now,left,P,env) {
    const {W,H} = env;

    while(this.t.length < 6) {
      const k = Math.random();
      const b = k < .45 ? 0 : k < .8 ? 1 : 2;
      const r = [58,36,22][b];

      this.t.push({
        x:GH.random(r,W-r),
        y:GH.random(120,H-r),
        r,
        pts:[10,25,50][b],
        vx:GH.random(-1,1)*[90,180,320][b],
        vy:GH.random(-1,1)*[60,120,220][b],
        age:0
      });
    }

    this.t.forEach(o => {
      o.x += o.vx*dt;
      o.y += o.vy*dt;
      o.age += dt;

      if(o.x < o.r || o.x > W-o.r) o.vx *= -1;
      if(o.y < 100+o.r || o.y > H-o.r) o.vy *= -1;
    });

    this.t = this.t.filter(o => o.age < 7);

    P.forEach(p => {
      if(p.id === "kb") {
        p.cx = env.mouse.x;
        p.cy = env.mouse.y;
      } else {
        const pad = p.pad || {};
        const rx = Number(pad.rx) || 0;
        const ry = Number(pad.ry) || 0;

        const sx = Math.abs(rx) > .12 ? rx : (p.in?.s || 0);
        const sy = Math.abs(ry) > .12 ? ry : (p.in?.y || 0);

        p.cx = GH.clamp(
          p.cx + sx * W * dt * 1.8,
          0,W
        );

        p.cy = GH.clamp(
          p.cy + sy * H * dt * 1.8,
          0,H
        );
      }

      if(p.fire || GH.pressed(p,"A") || GH.pressed(p,"X")) {
        p.fire = 0;
        p.fl = .15;

        const i = this.t.findIndex(o =>
          Math.hypot(o.x-p.cx,o.y-p.cy) <= o.r
        );

        if(i >= 0) {
          p.score += this.t[i].pts;
          this.t.splice(i,1);
          Sfx.play("hit");
        } else {
          Sfx.play("out");
        }
      }

      p.fl = Math.max(0,(p.fl||0)-dt);
    });
  },

  draw(g,W,H,P) {
    GH.rect(g,0,0,W,H,"#12303a");

    this.t.forEach(o => {
      [1,.66,.33].forEach((k,i) => {
        GH.circle(g,o.x,o.y,o.r*k,i%2 ? "#fff" : "#ff5d5d");
      });

      GH.text(g,o.pts,o.x,o.y+5,16,"#12303a");
    });

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

    const d = 1 + this.el/20;
    this.n -= dt;

    if(this.n <= 0) {
      this.w = (Math.random()<.5 ? -1 : 1) *
        (.5 + .15*d);

      this.n = (1.5+Math.random()*2)/Math.sqrt(d);
    }

    this.w *= Math.pow(.4,dt);

    P.forEach(p => {
      if(!p.alive) return;

      const s = GH.sx(p,env.keys);

      p.bv += (
        s*2.5 +
        this.w*2 +
        p.bx*.8 +
        Math.sin(this.el*.7+p.n)*.15*d
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
    GH.rect(g,0,0,W,H,"#2b2410");

    const w = W/P.length;

    P.forEach((p,i) => {
      const cx = i*w+w/2;
      const hw = w*.4;
      const e = this.edge();

      GH.rect(g,cx-hw*e,H*.7,hw*2*e,14,"#6b5a1d");

      GH.circle(
        g,
        cx+p.bx*hw,
        H*.7-20,
        20,
        p.alive ? p.c : "#555"
      );

      GH.text(g,`P${p.n} ${p.name}`,cx,H*.3,25,p.c);

      GH.text(
        g,
        p.alive
          ? (p.score/10).toFixed(1)+"s"
          : "OUT "+(p.score/10).toFixed(1)+"s",
        cx,
        H*.3+40,
        22
      );
    });

    GH.text(
      g,
      this.w>.2 ? "💨 →" : this.w<-.2 ? "← 💨" : "",
      W/2,
      90,
      40
    );
  },

  over(P) {
    return P.filter(p => p.alive).length <= (P.length>1 ? 1 : 0);
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
  help:"Press A, X or FIRE when the screen turns green.",
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

    if(this.st === "wait") {
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

      if(this.t <= 0) {
        this.st = "go";
        this.goAt = now;

        P.forEach(p => p.fire = 0);

        env.send("go",{r:this.round});
        Sfx.play("count");
      }
    }

    else if(this.st === "go") {
      const h = now-this.goAt;

      P.forEach(p => {
        if(pressed(p) && !p.fs && p.rtv == null) {
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

      if(P.every(p => p.fs || p.rtv != null) || h>2500) {
        P.forEach(p => {
          if(!p.fs && p.rtv == null) p.msg = "No response";
        });

        this.st = "show";
        this.t = 2.2;
      }
    }

    else {
      this.t -= dt;

      if(this.t <= 0) {
        this.round++;

        if(this.round>=5) {
          this.done = 1;
        } else {
          this.nr(P);
        }
      }
    }
  },

  draw(g,W,H,P) {
    GH.rect(
      g,0,0,W,H,
      this.st==="wait"
        ? "#b3261e"
        : this.st==="go"
          ? "#1fa855"
          : "#241c3f"
    );

    if(this.st !== "show") {
      GH.text(
        g,
        this.st==="wait" ? "WAIT..." : "PRESS!",
        W/2,
        H*.5,
        Math.min(W*.12,120)
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
   Original arcade slicing game.
--------------------------------------------------------- */

fruit: {
  name:"Fruit Slash",
  icon:"🍉",
  c:"#ff6b6b",
  desc:"Slash fruit before they fall. Avoid bombs.",
  help:"Move the right stick to aim. Press A or X to slash.",
  dur:50,

  init(P,env) {
    this.items = [];
    this.spawn = 0;
    this.particles = [];

    P.forEach(p => {
      p.slashCooldown = 0;
      p.combo = 0;
      p.lastHit = 0;
      p.sx = env.W/2;
      p.sy = env.H/2;
    });
  },

  update(dt,now,left,P,env) {
    const {W,H} = env;

    this.spawn -= dt;

    if(this.spawn <= 0) {
      this.spawn = GH.random(.45,.9);

      const bomb = Math.random()<.16;

      this.items.push({
        x:GH.random(80,W-80),
        y:H+40,
        vx:GH.random(-100,100),
        vy:GH.random(-780,-560),
        r:bomb ? 25 : 28,
        type:bomb ? "bomb" : "fruit",
        color:bomb ? "#252525" : [
          "#ff4545","#ffb52e","#7ed957","#d17cff","#ff77a8"
        ][Math.floor(Math.random()*5)],
        alive:true
      });
    }

    this.items.forEach(o => {
      o.x += o.vx*dt;
      o.y += o.vy*dt;
      o.vy += 700*dt;

      if(o.y > H+100) o.alive = false;
    });

    P.forEach(p => {
      const pad = p.pad || {};

      const rx = Number(pad.rx) || 0;
      const ry = Number(pad.ry) || 0;

      if(p.id === "kb") {
        p.sx = env.mouse.x;
        p.sy = env.mouse.y;
      } else {
        p.sx = GH.clamp(
          p.sx + rx*W*dt*1.8,
          0,W
        );

        p.sy = GH.clamp(
          p.sy + ry*H*dt*1.8,
          0,H
        );
      }

      p.slashCooldown = Math.max(0,p.slashCooldown-dt);

      const attack =
        p.fire ||
        GH.pressed(p,"A") ||
        GH.pressed(p,"X") ||
        GH.pressed(p,"R1");

      if(attack && p.slashCooldown<=0) {
        p.fire = 0;
        p.slashCooldown = .25;

        let hit = false;

        this.items.forEach(o => {
          if(!o.alive) return;

          const d = Math.hypot(o.x-p.sx,o.y-p.sy);

          if(d < o.r+65) {
            o.alive = false;
            hit = true;

            if(o.type === "bomb") {
              p.score = Math.max(0,p.score-100);
              p.combo = 0;
              Sfx.play("out");
            } else {
              p.combo++;
              p.score += 10*p.combo;
              Sfx.play("hit");
            }

            this.particles.push({
              x:o.x,
              y:o.y,
              r:5,
              life:.5,
              color:o.color
            });
          }
        });

        if(!hit) p.combo = 0;
      }
    });

    this.items = this.items.filter(o => o.alive);

    this.particles.forEach(o => {
      o.life -= dt;
      o.r += 60*dt;
    });

    this.particles = this.particles.filter(o => o.life>0);
  },

  draw(g,W,H,P) {
    GH.rect(g,0,0,W,H,"#172d35");

    for(let i=0;i<12;i++) {
      GH.circle(g,(i*137)%W,(i*89)%H,2,"#31505a");
    }

    this.items.forEach(o => {
      GH.circle(g,o.x,o.y,o.r,o.color);

      if(o.type === "bomb") {
        GH.text(g,"✹",o.x,o.y+9,28,"#fff");
      } else {
        GH.circle(g,o.x-o.r*.3,o.y-o.r*.3,5,"#ffffff");
      }
    });

    this.particles.forEach(o => {
      g.globalAlpha = Math.max(0,o.life*2);
      GH.circle(g,o.x,o.y,o.r,o.color);
      g.globalAlpha = 1;
    });

    P.forEach(p => {
      g.strokeStyle = p.c;
      g.lineWidth = 5;
      g.beginPath();
      g.arc(p.sx,p.sy,35,0,Math.PI*2);
      g.stroke();

      GH.text(g,p.combo ? "x"+p.combo : "",p.sx,p.sy-45,20,p.c);
    });

    GH.board(g,P);
  },

  over() {
    return false;
  }
},


/* ---------------------------------------------------------
   6. PLATFORM RUSH
   Original side-scrolling platform game.
--------------------------------------------------------- */

platform: {
  name:"Platform Rush",
  icon:"🍄",
  c:"#5be7a9",
  desc:"Jump across platforms and collect coins.",
  help:"Left stick moves. Press A or X to jump. B to dash.",
  dur:60,

  init(P,env) {
    this.world = 0;
    this.platforms = [];
    this.coins = [];
    this.hazards = [];
    this.ground = env.H-90;

    for(let i=0;i<14;i++) {
      this.platforms.push({
        x:i*210,
        y:this.ground-GH.random(70,190),
        w:GH.random(100,160),
        h:16
      });
    }

    this.coins = [];

    for(let i=0;i<35;i++) {
      this.coins.push({
        x:200+i*140,
        y:this.ground-GH.random(130,260),
        got:false
      });
    }

    this.hazards = [];

    for(let i=0;i<20;i++) {
      this.hazards.push({
        x:400+i*260,
        y:this.ground-22,
        w:35,
        h:22
      });
    }

    P.forEach(p => {
      p.px = 80;
      p.py = this.ground-50;
      p.pvx = 0;
      p.pvy = 0;
      p.pground = false;
      p.pdead = false;
      p.prespawn = 0;
    });
  },

  update(dt,now,left,P,env) {
    const {W,H} = env;

    P.forEach(p => {
      if(p.pdead) {
        p.prespawn -= dt;

        if(p.prespawn<=0) {
          p.pdead = false;
          p.px = this.world+80;
          p.py = this.ground-60;
          p.pvx = 0;
          p.pvy = 0;
        }

        return;
      }

      const move = GH.sx(p,env.keys);
      const jump =
        p.fire ||
        GH.pressed(p,"A") ||
        GH.pressed(p,"X");

      const dash = GH.pressed(p,"B");

      p.pvx += move*1000*dt;
      p.pvx *= Math.pow(.04,dt);

      p.pvx = GH.clamp(p.pvx,-350,350);

      if(dash) {
        p.pvx = move*650;
      }

      if(jump && p.pground) {
        p.pvy = -650;
        p.pground = false;
        Sfx.play("hit");
      }

      p.fire = 0;

      const oldY = p.py;

      p.pvy += 1500*dt;
      p.px += p.pvx*dt;
      p.py += p.pvy*dt;

      p.pground = false;

      const sx = p.px-this.world;

      if(p.pvy>=0) {
        if(p.py+38>=this.ground) {
          p.py = this.ground-38;
          p.pvy = 0;
          p.pground = true;
        }

        this.platforms.forEach(o => {
          const screenX = o.x-this.world;

          if(
            sx+20>screenX &&
            sx-20<screenX+o.w &&
            oldY+38<=o.y &&
            p.py+38>=o.y
          ) {
            p.py = o.y-38;
            p.pvy = 0;
            p.pground = true;
          }
        });
      }

      this.coins.forEach(o => {
        if(o.got) return;

        if(Math.hypot(p.px-o.x,p.py-o.y)<45) {
          o.got = true;
          p.score += 25;
          Sfx.play("point");
        }
      });

      this.hazards.forEach(o => {
        if(
          Math.abs(p.px-o.x)<35 &&
          Math.abs(p.py-(this.ground-25))<45
        ) {
          p.pdead = true;
          p.prespawn = 1.2;
          p.score = Math.max(0,p.score-50);
          Sfx.play("out");
        }
      });

      if(p.py>H+150) {
        p.pdead = true;
        p.prespawn = 1.2;
      }

      this.world = Math.max(
        this.world,
        p.px-W*.35
      );
    });

    this.platforms = this.platforms.filter(o => o.x-this.world>-250);
  },

  draw(g,W,H,P) {
    GH.rect(g,0,0,W,H,"#77c9ef");

    for(let i=0;i<8;i++) {
      GH.circle(g,(i*210-this.world*.25%W+W)%W,100+i%3*35,35,"#e4f7ff");
    }

    GH.rect(g,0,this.ground,W,H-this.ground,"#398b45");

    for(let i=0;i<30;i++) {
      GH.rect(
        g,
        (i*90-this.world%90+W)%W,
        this.ground+15,
        4,15,
        "#286c36"
      );
    }

    this.platforms.forEach(o => {
      const x = o.x-this.world;

      if(x+o.w<0 || x>W) return;

      GH.rect(g,x,o.y,o.w,o.h,"#8b592e");
      GH.rect(g,x,o.y,o.w,5,"#57c65b");
    });

    this.coins.forEach(o => {
      if(o.got) return;

      const x = o.x-this.world;

      if(x<0 || x>W) return;

      GH.circle(g,x,o.y,12,"#ffd43b");
      GH.circle(g,x,o.y,5,"#fff1a6");
    });

    this.hazards.forEach(o => {
      const x = o.x-this.world;

      if(x<0 || x>W) return;

      GH.text(g,"▲",x,this.ground-15,34,"#e84b4b");
    });

    P.forEach(p => {
      const x = p.px-this.world;

      if(p.pdead) return;

      GH.rect(g,x-17,p.py-22,34,40,p.c);
      GH.circle(g,x,p.py-30,17,"#ffd3a3");

      GH.rect(g,x-17,p.py+14,12,15,"#25344b");
      GH.rect(g,x+5,p.py+14,12,15,"#25344b");

      GH.text(g,p.name,x,p.py-60,16,p.c);
    });

    GH.text(g,"COINS",W-90,35,18,"#fff");
    GH.board(g,P);
  },

  over() {
    return false;
  }
},


/* ---------------------------------------------------------
   7. ARENA CLASH
   Original multiplayer fighting game.
--------------------------------------------------------- */

fighter: {
  name:"Arena Clash",
  icon:"🥊",
  c:"#ff9f43",
  desc:"Fight other players in a multiplayer arena.",
  help:"Left stick moves. A punches. B kicks. X blocks. Y special attack.",
  dur:75,

  init(P,env) {
    this.floor = env.H-100;
    this.particles = [];

    P.forEach((p,i) => {
      p.fx = env.W*(i+1)/(P.length+1);
      p.fy = this.floor;
      p.facing = i<P.length/2 ? 1 : -1;
      p.health = 100;
      p.attackCooldown = 0;
      p.hitCooldown = 0;
      p.attack = "";
      p.attackTime = 0;
      p.blocking = false;
      p.alive = true;
    });
  },

  update(dt,now,left,P,env) {
    P.forEach(p => {
      if(!p.alive) return;

      p.attackCooldown = Math.max(0,p.attackCooldown-dt);
      p.hitCooldown = Math.max(0,p.hitCooldown-dt);
      p.attackTime = Math.max(0,p.attackTime-dt);

      const move = GH.sx(p,env.keys);

      p.fx += move*280*dt;
      p.fx = GH.clamp(p.fx,35,env.W-35);

      p.blocking =
        GH.pressed(p,"X") ||
        GH.pressed(p,"L1");

      if(p.attackTime<=0) p.attack = "";

      let type = "";

      if(
        GH.pressed(p,"A") ||
        p.fire
      ) type = "punch";

      if(GH.pressed(p,"B")) type = "kick";
      if(GH.pressed(p,"Y")) type = "special";

      if(type && p.attackCooldown<=0) {
        p.attack = type;
        p.attackTime = .22;
        p.attackCooldown = type==="special" ? 1.2 : .45;
        p.fire = 0;

        Sfx.play("hit");

        P.forEach(target => {
          if(target===p || !target.alive) return;

          const distance = Math.abs(target.fx-p.fx);

          const inFront =
            Math.sign(target.fx-p.fx) === p.facing;

          if(distance<105 && inFront && target.hitCooldown<=0) {
            if(target.blocking) {
              target.health -= type==="special" ? 4 : 1;
            } else {
              target.health -=
                type==="punch" ? 10 :
                type==="kick" ? 16 : 25;

              target.fx += p.facing*35;
              target.hitCooldown = .45;
            }

            target.health = Math.max(0,target.health);

            if(target.health<=0) {
              target.alive = false;
              p.score += 100;
              Sfx.play("out");
            } else {
              p.score += 10;
            }
          }
        });
      }

      const opponents = P.filter(q => q!==p && q.alive);

      if(opponents.length) {
        const nearest = opponents.reduce((a,b) =>
          Math.abs(a.fx-p.fx)<Math.abs(b.fx-p.fx) ? a : b
        );

        p.facing = nearest.fx>p.fx ? 1 : -1;
      }
    });

    this.particles = this.particles.filter(o => {
      o.life -= dt;
      return o.life>0;
    });
  },

  draw(g,W,H,P) {
    GH.rect(g,0,0,W,H,"#211d35");

    for(let i=0;i<12;i++) {
      GH.circle(g,i*120+40,100+(i%3)*25,25,"#38304e");
    }

    GH.rect(g,0,this.floor,W,H-this.floor,"#493a55");
    GH.rect(g,0,this.floor,W,8,"#d5a34c");

    P.forEach(p => {
      const x = p.fx;
      const y = p.fy;

      GH.rect(g,x-22,y-65,44,48,p.alive?p.c:"#555");
      GH.circle(g,x,y-78,20,"#f1c5a2");

      GH.rect(g,x-20,y-17,15,18,"#20243b");
      GH.rect(g,x+5,y-17,15,18,"#20243b");

      if(p.attackTime>0) {
        const armX = x+p.facing*(p.attack==="special"?100:55);

        GH.rect(
          g,
          Math.min(x,armX),
          y-58,
          Math.abs(armX-x),
          13,
          p.attack==="special" ? "#ffd43b" : "#fff"
        );
      }

      if(p.blocking) {
        g.strokeStyle = "#7ce7ff";
        g.lineWidth = 6;
        g.beginPath();
        g.arc(x,y-55,43,-1.3,1.3);
        g.stroke();
      }

      GH.text(g,p.name,x,y-112,17,p.c);

      GH.rect(g,x-35,y-105,70,8,"#5a2730");
      GH.rect(g,x-35,y-105,70*(p.health/100),8,"#5be18b");

      if(!p.alive) {
        GH.text(g,"K.O.",x,y-140,28,"#ff5d5d");
      }
    });

    GH.board(g,P);
  },

  over(P) {
    return P.filter(p => p.alive).length<=1;
  }
},


/* ---------------------------------------------------------
   8. NEON RACER
   Independent arcade racing game.
--------------------------------------------------------- */

neon: {
  name:"Neon Racer",
  icon:"🏁",
  c:"#4dd0e1",
  desc:"Race through traffic and avoid incoming cars.",
  help:"Left stick steers. A or X activates boost.",
  dur:60,

  init(P,env) {
    this.traffic = [];
    this.lines = [];
    this.speed = 430;
    this.spawn = 0;
    this.elapsed = 0;

    for(let i=0;i<14;i++) {
      this.lines.push(i*90);
    }

    P.forEach((p,i) => {
      p.nx = env.W*(i+1)/(P.length+1);
      p.ny = env.H*.75;
      p.nspeed = 0;
      p.nboost = 0;
      p.ninv = 0;
      p.nhits = 0;
    });
  },

  update(dt,now,left,P,env) {
    const {W,H} = env;

    this.elapsed += dt;
    this.spawn -= dt;

    const roadW = Math.min(W*.8,700);
    const roadX = (W-roadW)/2;

    if(this.spawn<=0) {
      this.spawn = Math.max(.35,.9-this.elapsed*.008);

      this.traffic.push({
        x:GH.random(roadX+70,roadX+roadW-70),
        y:-100,
        w:45,
        h:75,
        speed:GH.random(220,380)
      });
    }

    this.traffic.forEach(o => {
      o.y += (this.speed*.55+o.speed)*dt;
    });

    this.traffic = this.traffic.filter(o => o.y<H+120);

    this.lines = this.lines.map(y => y+this.speed*dt);

    this.lines = this.lines.map(y => y>H ? y-H : y);

    P.forEach(p => {
      const steer = GH.sx(p,env.keys);

      const boost =
        GH.pressed(p,"A") ||
        GH.pressed(p,"X");

      p.nboost = Math.max(0,p.nboost-dt);
      p.ninv = Math.max(0,p.ninv-dt);

      if(boost && p.nboost<=0) {
        p.nboost = 1.2;
        p.score += 5;
      }

      const speedFactor = p.nboost>0 ? 1.8 : 1;

      p.nx += steer*420*dt*speedFactor;

      p.nx = GH.clamp(
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
          p.score = Math.max(0,p.score-50);
          p.nhits++;
          p.ninv = 1.5;
          Sfx.play("out");
        }
      });

      p.score += Math.round(dt*10*speedFactor);
    });
  },

  draw(g,W,H,P) {
    GH.rect(g,0,0,W,H,"#111827");

    const roadW = Math.min(W*.8,700);
    const roadX = (W-roadW)/2;

    GH.rect(g,0,0,W,H,"#1b332b");
    GH.rect(g,roadX,0,roadW,H,"#343a49");

    GH.rect(g,roadX,0,8,H,"#f7d354");
    GH.rect(g,roadX+roadW-8,0,8,H,"#f7d354");

    this.lines.forEach(y => {
      GH.rect(g,roadX+roadW/3-3,y,6,45,"#e9edf5");
      GH.rect(g,roadX+roadW*2/3-3,y,6,45,"#e9edf5");
    });

    this.traffic.forEach(o => {
      GH.rect(g,o.x-o.w/2,o.y-o.h/2,o.w,o.h,"#e65a5a");
      GH.rect(g,o.x-o.w/2+7,o.y-o.h/2+10,o.w-14,17,"#a9e8f5");
    });

    P.forEach(p => {
      const color = p.ninv>0 && Math.floor(p.ninv*12)%2 ? "#fff" : p.c;

      GH.rect(g,p.nx-23,p.ny-38,46,76,color);
      GH.rect(g,p.nx-15,p.ny-28,30,17,"#a9e8f5");
      GH.rect(g,p.nx-15,p.ny+12,30,14,"#1c2638");

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

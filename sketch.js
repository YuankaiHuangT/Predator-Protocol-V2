const MAP_W = 3200;
const MAP_H = 3200;

let gameState;
let cam = { x: 0, y: 0 };
let player;
let minimap;
let mouseHeld = false;
let boids = [];
let squares = [];
let boidAmount = 300;

const XP_THRESHOLDS = [
  100, 200, 300,
  500, 700, 900,
  1200, 1500, 1800, 2100,
  2600, 3100, 3600, 4100,
  4800, 5500, 6200,
  6900, 7900
];

// ── Player ────────────────────────────────────────────────

class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.angle = -Math.PI / 2;
    this.speed = 10.0;
    this.size = 20;
    this.control = 0.12;
  }

  update(p, cam, mouseHeld) {
    if (mouseHeld) {
      let mx = p.mouseX + cam.x;
      let my = p.mouseY + cam.y;
      let dx = mx - this.x, dy = my - this.y;
      let d  = Math.sqrt(dx * dx + dy * dy);
      if (d > 6) {
        let target = Math.atan2(dy, dx), da = target - this.angle;
        while (da >  Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        this.angle += da * this.control;
        this.vx += Math.cos(this.angle) * 0.08 * this.speed;
        this.vy += Math.sin(this.angle) * 0.08 * this.speed;
      }
    }

    // Drag
    this.vx *= 0.96;
    this.vy *= 0.96;

    // Speed cap
    let spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (spd > this.speed) {
      this.vx = this.vx / spd * this.speed;
      this.vy = this.vy / spd * this.speed;
    }

    // Update position
    this.x = p.constrain(this.x + this.vx, this.size, MAP_W - this.size);
    this.y = p.constrain(this.y + this.vy, this.size, MAP_H - this.size);
  }

  draw(p) {
    p.push();
    p.translate(this.x, this.y);
    p.rotate(this.angle);
    p.fill(100, 180, 255);
    p.noStroke();
    p.triangle(this.size * 1.1, 0, -this.size * 0.8, -this.size * 0.65, -this.size * 0.8, this.size * 0.65);
    p.pop();
  }
}

// ── GameState ─────────────────────────────────────────────

class GameState {
  constructor() {
    this.score = 0;
    this.hp = 100;
    this.maxHp = 100;
    this.xp = 0;
    this.level = 0;
  }

  update() {
    // Regen 2% hp per second (60fps)
    if (this.hp < this.maxHp) {
      this.hp += this.maxHp * 0.02 / 60;
      this.hp = Math.min(this.hp, this.maxHp);
    }
  }

  addScore(points) {
    this.score += points;
    this.xp    += points;
    let threshold = XP_THRESHOLDS[this.level - 1];
    if (threshold && this.xp >= threshold) {
      this.xp -= threshold;
      this.level++;
      return true;
    }
    return false;
  }

  draw(p, minimap) {
    let barMaxW = p.width;
    let barW    = (this.maxHp / 2000) * barMaxW;
    let centerX = p.width / 2;
    let hpY     = p.height - 24;
    let xpY     = p.height - 34;

    // HP bar
    p.noStroke();
    p.fill(40, 40, 40);
    p.rect(centerX - barW / 2, hpY, barW, 6);
    p.fill(255);
    p.rect(centerX - barW / 2, hpY, barW * (this.hp / this.maxHp), 6);

    // XP bar
    let xpBarW  = 200;
    let threshold = XP_THRESHOLDS[this.level - 1] || XP_THRESHOLDS[XP_THRESHOLDS.length - 1];
    p.fill(30, 30, 60);
    p.rect(centerX - xpBarW / 2, xpY, xpBarW, 3, 2);
    p.fill(100, 180, 255);
    p.rect(centerX - xpBarW / 2, xpY, xpBarW * (this.xp / threshold), 3, 2);

    // Score
    p.fill(200, 200, 200);
    p.textSize(12);
    p.textAlign(p.LEFT, p.TOP);
    p.text('SCORE  ' + this.score, minimap.pad, minimap.pad + minimap.h + 8);
  }
}

// ── Boid ──────────────────────────────────────────────────

class Boid {
  constructor(p, x, y, allBoids) {
    this.x = x;
    this.y = y;
    this.size = 7;
    this.speed = 5;
    this.alive = true;
    this.wanderOffset = p.random(1000);

    // Point toward nearest boid on spawn
    let nearest = null, nearestDist = Infinity;
    for (let b of allBoids) {
      if (!b.alive) continue;
      let dx = b.x - this.x, dy = b.y - this.y;
      let d  = Math.sqrt(dx * dx + dy * dy);
      if (d < nearestDist && d > 0) { nearestDist = d; nearest = b; }
    }
    if (nearest) {
      let dx = nearest.x - this.x, dy = nearest.y - this.y;
      let d  = Math.sqrt(dx * dx + dy * dy);
      let spd = p.random(2, 3);
      this.vx = (dx / d) * spd;
      this.vy = (dy / d) * spd;
    } else {
      let ang = p.random(p.TWO_PI);
      let spd = p.random(2, 3);
      this.vx = Math.cos(ang) * spd;
      this.vy = Math.sin(ang) * spd;
    }
  }

  update(p, others, player, squares) {

    // Flee player
    let pdx = player.x - this.x;
    let pdy = player.y - this.y;
    let playerDistance = Math.sqrt(pdx * pdx + pdy * pdy);
    let fleeingPlayer = playerDistance < 400;
    if (fleeingPlayer) {
      this.vx += -(pdx / playerDistance) * 3 * 0.3;
      this.vy += -(pdy / playerDistance) * 3 * 0.3;
    }

    // Flee squares only if not fleeing player
    if (!fleeingPlayer) {
      for (let s of squares) {
        if (!s.alive) continue;
        let dx = this.x - s.x;
        let dy = this.y - s.y;
        let d  = Math.sqrt(dx * dx + dy * dy);
        if (d < 150 && d > 0) {
          this.vx += (dx / d) * 1.5;
          this.vy += (dy / d) * 1.5;
        }
      }
    }

    // Separation
    let sx = 0, sy = 0, scnt = 0;
    // Alignment
    let ax = 0, ay = 0, acnt = 0;
    // Cohesion
    let cX = 0, cY = 0, ccnt = 0;

    for (let o of others) {
      if (o === this) continue;
      let odx = this.x - o.x;
      let ody = this.y - o.y;
      let otherDistance = Math.sqrt(odx * odx + ody * ody);

      if (otherDistance < 50 && otherDistance > 0) {
        let f = (80 - otherDistance) / 50;
        sx += (odx / otherDistance) * f;
        sy += (ody / otherDistance) * f;
        scnt++;
      }
      if (otherDistance < 100) { ax += o.vx; ay += o.vy; acnt++; }
      if (otherDistance < 75)  { cX += o.x;  cY += o.y;  ccnt++; }
    }

    if (scnt > 0) { this.vx += (sx / scnt) * 0.5;  this.vy += (sy / scnt) * 0.5; }
    if (acnt > 0) { this.vx += (ax / acnt) * 0.06; this.vy += (ay / acnt) * 0.06; }
    if (ccnt > 0) {
      this.vx += (cX / ccnt - this.x) * 0.005;
      this.vy += (cY / ccnt - this.y) * 0.005;
    }

    if (scnt === 0 && acnt === 0 && ccnt === 0) {
      // Alone — nudge forward along current direction
      let spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      if (spd > 0.1) {
        this.vx += (this.vx / spd) * 0.3;
        this.vy += (this.vy / spd) * 0.3;
      }
      this.vx += p.random(-0.03, 0.03);
      this.vy += p.random(-0.03, 0.03);
    } else {
      this.vx += p.random(-0.05, 0.05);
      this.vy += p.random(-0.05, 0.05);
    }

    // Boundary repulsion
    let M = 200, BF = 16;
    if (this.x < M)         this.vx += BF / Math.max(this.x, 1);
    if (this.x > MAP_W - M) this.vx -= BF / Math.max(MAP_W - this.x, 1);
    if (this.y < M)         this.vy += BF / Math.max(this.y, 1);
    if (this.y > MAP_H - M) this.vy -= BF / Math.max(MAP_H - this.y, 1);

    // Speed cap
    let spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (spd > this.speed) {
      this.vx = this.vx / spd * this.speed;
      this.vy = this.vy / spd * this.speed;
    }

    // Drag
    this.vx *= 0.94;
    this.vy *= 0.94;

    // Update position
    this.x = p.constrain(this.x + this.vx, this.size, MAP_W - this.size);
    this.y = p.constrain(this.y + this.vy, this.size, MAP_H - this.size);
  }

  checkEat(player) {
    let dx = player.x - this.x;
    let dy = player.y - this.y;
    if (Math.sqrt(dx * dx + dy * dy) < player.size + this.size) {
      this.alive = false;
      return true;
    }
    return false;
  }

  draw(p) {
    p.push();
    p.translate(this.x, this.y);
    p.rotate(Math.atan2(this.vy, this.vx));
    p.fill(255);
    p.noStroke();
    p.triangle(this.size * 1.1, 0, -this.size * 0.8, -this.size * 0.65, -this.size * 0.8, this.size * 0.65);
    p.pop();
  }
}

// ── Square ────────────────────────────────────────────────

class Square {
  constructor(p, x, y) {
    this.x = x;
    this.y = y;
    this.vx = p.random(-1, 1);
    this.vy = p.random(-1, 1);
    this.angle = p.random(p.TWO_PI);
    this.size = 10;
    this.speed = 6;
    this.alive = true;
  }

  update(p, squares, boids, player, gameState) {

    // Check player distance first
    let pdx = player.x - this.x;
    let pdy = player.y - this.y;
    let pd  = Math.sqrt(pdx * pdx + pdy * pdy);
    let playerNearby = gameState.level >= 5 && pd < 250;

    if (playerNearby) {
      // Flee player
      this.vx -= (pdx / pd) * 2.0;
      this.vy -= (pdy / pd) * 2.0;
    } else {
      // Chase nearest boid
      let nearestBoid = null, nearestDist = Infinity;
      for (let b of boids) {
        if (!b.alive) continue;
        let dx = b.x - this.x, dy = b.y - this.y;
        let d  = Math.sqrt(dx * dx + dy * dy);
        if (d < nearestDist) { nearestDist = d; nearestBoid = b; }
      }
      if (nearestBoid && nearestDist < 800) {
        let dx = nearestBoid.x - this.x, dy = nearestBoid.y - this.y;
        let d  = Math.sqrt(dx * dx + dy * dy);
        let force = p.map(nearestDist, 0, 300, 1.2, 1);
        this.vx += (dx / d) * force;
        this.vy += (dy / d) * force;
      } else {
        // Wander
        this.vx += p.random(-0.15, 0.15);
        this.vy += p.random(-0.15, 0.15);
      }
    }

    // Separation from other squares
    for (let o of squares) {
      if (o === this || !o.alive) continue;
      let dx = this.x - o.x, dy = this.y - o.y;
      let d  = Math.sqrt(dx * dx + dy * dy);
      if (d < 60 && d > 0) {
        let f = (60 - d) / 60;
        this.vx += (dx / d) * f * 0.8;
        this.vy += (dy / d) * f * 0.8;
      }
    }

    // Boundary repulsion
    let M = 200, BF = 8;
    if (this.x < M)         this.vx += BF / Math.max(this.x, 1);
    if (this.x > MAP_W - M) this.vx -= BF / Math.max(MAP_W - this.x, 1);
    if (this.y < M)         this.vy += BF / Math.max(this.y, 1);
    if (this.y > MAP_H - M) this.vy -= BF / Math.max(MAP_H - this.y, 1);

    // Speed cap
    let spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (spd > this.speed) {
      this.vx = this.vx / spd * this.speed;
      this.vy = this.vy / spd * this.speed;
    }

    // Drag
    this.vx *= 0.94;
    this.vy *= 0.94;

    // Smooth angle interpolation
    if (spd > 0.2) {
      let target = Math.atan2(this.vy, this.vx);
      let da = target - this.angle;
      while (da >  Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      this.angle += da * 0.1;
    }

    // Update position
    this.x = p.constrain(this.x + this.vx, this.size * 2, MAP_W - this.size * 2);
    this.y = p.constrain(this.y + this.vy, this.size * 2, MAP_H - this.size * 2);

    // Eat boids on contact
    for (let b of boids) {
      if (!b.alive) continue;
      let dx = b.x - this.x, dy = b.y - this.y;
      if (Math.sqrt(dx * dx + dy * dy) < this.size + b.size) {
        b.alive = false;
      }
    }
  }

  checkEat(player, gameState) {
    if (gameState.level < 5) return false;
    let dx = player.x - this.x, dy = player.y - this.y;
    if (Math.sqrt(dx * dx + dy * dy) < player.size + this.size) {
      this.alive = false;
      return true;
    }
    return false;
  }

  draw(p, gameState) {
      p.push();
      p.translate(this.x, this.y);
      p.rotate(this.angle);
      p.rectMode(p.CENTER);
      if (gameState.level < 5) {
        p.fill(239, 159, 39); // yellow before level 5
      } else {
        p.fill(255); // white at level 5+
      }
      p.stroke(0, 0, 0, 50);
      p.strokeWeight(1);
      p.rect(0, 0, this.size * 4, this.size * 2);
      p.stroke(0, 0, 0, 80);
      p.line(0, 0, this.size * 2, 0);
      p.rectMode(p.CORNER);
      p.pop();
    }
  }

// ── Minimap ───────────────────────────────────────────────

class miniMap {
  constructor() {
    this.w = 200;
    this.h = 200;
    this.pad = 16;
  }

  draw(p, player, cam, boids, squares) {
    let sx = this.w / MAP_W;
    let sy = this.h / MAP_H;

    // Background
    p.fill(12, 12, 22, 160);
    p.stroke(55, 55, 85);
    p.strokeWeight(1);
    p.rect(this.pad, this.pad, this.w, this.h, 4);

    // Boids
    p.noStroke();
    p.fill(255, 255, 255, 150);
    for (let b of boids) {
      if (!b.alive) continue;
      p.ellipse(this.pad + b.x * sx, this.pad + b.y * sy, 2.5, 2.5);
    }

    // Squares
    p.fill(239, 159, 39, 150);
    for (let s of squares) {
      if (!s.alive) continue;
      p.rect(this.pad + s.x * sx - 1.5, this.pad + s.y * sy - 1.5, 3, 3);
    }

    // Viewport
    p.noFill();
    p.stroke(100, 180, 255, 150);
    p.rect(this.pad + cam.x * sx, this.pad + cam.y * sy, p.width * sx, p.height * sy, 2);

    // Player
    p.noStroke();
    p.fill(100, 180, 255);
    p.ellipse(this.pad + player.x * sx, this.pad + player.y * sy, 5, 5);
  }
}

// ── P5 sketch ─────────────────────────────────────────────

new p5(function(p) {

  p.setup = function() {
    let cnv = p.createCanvas(p.windowWidth, p.windowHeight);
    cnv.style('display', 'block');
    cnv.style('position', 'fixed');
    cnv.style('top', '0');
    cnv.style('left', '0');
    player   = new Player(MAP_W / 2, MAP_H / 2);
    minimap  = new miniMap();
    gameState = new GameState();
    for (let i = 0; i < boidAmount; i++) {
      boids.push(new Boid(p, p.random(MAP_W), p.random(MAP_H), boids));
    }
    for (let i = 0; i < 10; i++) {
      squares.push(new Square(p, p.random(MAP_W), p.random(MAP_H)));
    }
  };

  p.windowResized = function() { p.resizeCanvas(p.windowWidth, p.windowHeight); };
  p.mousePressed  = function() { if (p.mouseButton === p.LEFT) mouseHeld = true; };
  p.mouseReleased = function() { if (p.mouseButton === p.LEFT) mouseHeld = false; };

  p.draw = function() {
    p.background(10, 10, 18);

    cam.x = p.constrain(player.x - p.width  / 2, 0, MAP_W - p.width);
    cam.y = p.constrain(player.y - p.height / 2, 0, MAP_H - p.height);

    p.push();
    p.translate(-cam.x, -cam.y);

    // Grid
    p.stroke(22, 22, 35); p.strokeWeight(1);
    for (let x = 0; x < MAP_W; x += 150) p.line(x, 0, x, MAP_H);
    for (let y = 0; y < MAP_H; y += 150) p.line(0, y, MAP_W, y);

    // Map border
    p.noFill(); p.stroke(60, 60, 90); p.strokeWeight(2);
    p.rect(0, 0, MAP_W, MAP_H);

    // Player
    player.update(p, cam, mouseHeld);
    player.draw(p);

    // Boids
    for (let b of boids) {
      if (!b.alive) continue;
      b.update(p, boids, player, squares);
      if (b.checkEat(player)) {
        gameState.addScore(10);
      }
      b.draw(p);
    }

    // Squares
    for (let s of squares) {
      if (!s.alive) continue;
      s.update(p, squares, boids, player, gameState);
      if (s.checkEat(player, gameState)) {
        gameState.addScore(100);
      }
      s.draw(p, gameState);
    }

    p.pop();

    minimap.draw(p, player, cam, boids, squares);
    gameState.update();
    gameState.draw(p, minimap);

    // Respawn boids
    if (p.frameCount % 300 === 0) {
      let aliveBoids = boids.filter(function(b) { return b.alive; }).length;
      let toSpawn = Math.floor((boidAmount - aliveBoids) * 0.5);
      for (let i = 0; i < toSpawn; i++) {
        boids.push(new Boid(p, p.random(MAP_W), p.random(MAP_H), boids));
      }
    }
  };

});

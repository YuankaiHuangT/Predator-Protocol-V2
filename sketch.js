const MAP_W = 3200;
const MAP_H = 3200;

let gameState;
let cam = { x: 0, y: 0 };
let player;
let minimap;
let mouseHeld = false;
let boids = [];
let squares = [];
let bigSquares = [];
let obstacles = [];
let boidAmount = 300;

let screen = 'start';

const XP_THRESHOLDS = [
  100, 200, 300,
  500, 700, 900,
  1200, 1500, 1800, 2100,
  2600, 3100, 3600, 4100,
  4800, 5500, 6200,
  6900, 7900
];

//Player

class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.angle = -Math.PI / 2;
    this.speed = 10.0;
    this.size = 20;
    this.control = 0.12;
    this.history = [];
    this.historyMax = 15;
    this.dashTimer = 0;
    this.dashFrames = 18;
    this.dashCharges = 1;
    this.dashChargesMax = 1;
    this.dashCooldown = 0;
    this.dashCooldownMax = 10;
    this.invincible = 0;
  }

  dash() {
    if (this.dashCharges > 0) {
      this.dashCharges--;
      this.dashTimer = this.dashFrames;
    }
  }

  takeDamage(gameState, amount, bounceVx, bounceVy) {
    if (this.invincible > 0) return;
    gameState.hp -= amount;
    if (this.dashTimer <= 0) {
      this.vx = bounceVx;
      this.vy = bounceVy;
    }
    this.invincible = 30;
  }

  update(p, cam, mouseHeld, obstacles) {
    if (this.invincible > 0) this.invincible--;

    if (this.dashCharges < this.dashChargesMax) {
      this.dashCooldown++;
      if (this.dashCooldown >= this.dashCooldownMax) {
        this.dashCooldown = 0;
        this.dashCharges++;
      }
    }

    // Steering — always runs, even during dash
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
      }
    }

    if (this.dashTimer > 0) {
      this.dashTimer--;
      let progress = this.dashTimer / this.dashFrames;
      let t = 1 - progress;
      let force = Math.sin(t * Math.PI) * this.speed * 0.2;
      this.vx += Math.cos(this.angle) * force;
      this.vy += Math.sin(this.angle) * force;
      this.invincible = 18;
    } else if (mouseHeld) {
      let mx = p.mouseX + cam.x;
      let my = p.mouseY + cam.y;
      let dx = mx - this.x, dy = my - this.y;
      let d  = Math.sqrt(dx * dx + dy * dy);
      if (d > 6) {
        this.vx += Math.cos(this.angle) * 0.08 * this.speed;
        this.vy += Math.sin(this.angle) * 0.08 * this.speed;
      }
    }

    for (let o of obstacles) {
      let dx = this.x - o.x, dy = this.y - o.y;
      let d  = Math.sqrt(dx * dx + dy * dy);
      if (d < this.size + o.r && d > 0) {
        let nx = dx / d, ny = dy / d;
        this.takeDamage(gameState, 30, nx * 12, ny * 12);
      }
    }

    let drag = this.dashTimer > 0 ? 0.98 : 0.96;
    this.vx *= drag; this.vy *= drag;

    let spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (this.dashTimer <= 0 && spd > this.speed) {
      this.vx = this.vx / spd * this.speed;
      this.vy = this.vy / spd * this.speed;
    }

    this.history.push({ x: this.x, y: this.y });
    if (this.history.length > this.historyMax) this.history.shift();

    this.x = p.constrain(this.x + this.vx, this.size, MAP_W - this.size);
    this.y = p.constrain(this.y + this.vy, this.size, MAP_H - this.size);
  }

  draw(p) {
    p.noStroke();
    for (let i = 0; i < this.history.length; i++) {
      let t = i / this.history.length;
      let size = this.size * 0.8 * t;
      p.fill(100, 180, 255, t * 120);
      p.push();
      p.translate(this.history[i].x, this.history[i].y);
      p.rotate(this.angle);
      p.triangle(size * 1.1, 0, -size * 0.8, -size * 0.65, -size * 0.8, size * 0.65);
      p.pop();
    }
    p.push();
    p.translate(this.x, this.y); p.rotate(this.angle);
    if (this.invincible > 0 && Math.floor(this.invincible / 6) % 2 === 0) p.fill(255, 100, 100);
    else if (this.dashTimer > 0) p.fill(200, 230, 255);
    else p.fill(100, 180, 255);
    p.noStroke();
    p.triangle(this.size * 1.1, 0, -this.size * 0.8, -this.size * 0.65, -this.size * 0.8, this.size * 0.65);
    p.pop();
  }

  drawDashHUD(p) {
    let centerX = p.width / 2;
    let barY    = p.height - 48;
    let totalW  = this.dashChargesMax * 20 - 4;
    let startX  = centerX - totalW / 2;
    for (let i = 0; i < this.dashChargesMax; i++) {
      p.fill(i < this.dashCharges ? p.color(100, 180, 255) : p.color(40, 40, 60));
      p.stroke(60, 90, 130); p.strokeWeight(1);
      p.rect(startX + i * 20, barY, 14, 8, 2);
    }
    if (this.dashCharges < this.dashChargesMax) {
      let cdPct = this.dashCooldown / this.dashCooldownMax;
      let barW  = this.dashChargesMax * 20 - 4;
      p.noStroke();
      p.fill(30, 35, 55); p.rect(centerX - barW / 2, barY + 11, barW, 3, 2);
      p.fill(60, 120, 200); p.rect(centerX - barW / 2, barY + 11, barW * cdPct, 3, 2);
    }
  }
}
//GameState

class GameState {
  constructor() {
    this.score = 0; this.hp = 100; this.maxHp = 100;
    this.xp = 0; this.level = 0;
  }

  update() {
    if (this.hp < this.maxHp) {
      this.hp += this.maxHp * 0.02 / 60;
      this.hp  = Math.min(this.hp, this.maxHp);
    }
  }

  addScore(points, xpMult) {
    this.score += Math.round(points * xpMult);
    this.xp    += Math.round(points * xpMult);
    let threshold = XP_THRESHOLDS[this.level];
    if (threshold && this.xp >= threshold) {
      this.xp -= threshold; this.level++; return true;
    }
    return false;
  }

  draw(p, minimap) {
    let barMaxW = p.width;
    let barW    = (this.maxHp / 2000) * barMaxW;
    let centerX = p.width / 2;
    let hpY = p.height - 24, xpY = p.height - 34;

    p.noStroke();
    p.fill(40, 40, 40); p.rect(centerX - barW / 2, hpY, barW, 6);
    p.fill(255);        p.rect(centerX - barW / 2, hpY, barW * (this.hp / this.maxHp), 6);

    let xpBarW    = 200;
    let threshold = XP_THRESHOLDS[this.level] || XP_THRESHOLDS[XP_THRESHOLDS.length - 1];
    p.fill(30, 30, 60);    p.rect(centerX - xpBarW / 2, xpY, xpBarW, 3, 2);
    p.fill(100, 180, 255); p.rect(centerX - xpBarW / 2, xpY, xpBarW * (this.xp / threshold), 3, 2);

    p.fill(200, 200, 200); p.textSize(12); p.textAlign(p.LEFT, p.TOP);
    p.text('SCORE  ' + this.score, minimap.pad, minimap.pad + minimap.h + 8);
    p.text('LVL  ' + (this.level + 1), minimap.pad, minimap.pad + minimap.h + 24);
  }
}

//Obstacle

class Obstacle {
  constructor(x, y, r) {
    this.x = x; this.y = y; this.r = r;
    this.vx = 0; this.vy = 0;
    this.originX = x; this.originY = y;
  }

  update(p, obstacles) {
    this.vx += p.random(-0.04, 0.04);
    this.vy += p.random(-0.04, 0.04);
    this.vx *= 0.96; this.vy *= 0.96;
    let spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (spd > 0.4) { this.vx = this.vx / spd * 0.4; this.vy = this.vy / spd * 0.4; }
    this.vx += (this.originX - this.x) * 0.0005;
    this.vy += (this.originY - this.y) * 0.0005;
    for (let o of obstacles) {
      if (o === this) continue;
      let dx = this.x - o.x, dy = this.y - o.y;
      let d  = Math.sqrt(dx * dx + dy * dy);
      let minDist = this.r + o.r + 10;
      if (d < minDist && d > 0) {
        let f = (minDist - d) / minDist;
        this.vx += (dx / d) * f * 1.5; this.vy += (dy / d) * f * 1.5;
      }
    }
    this.x = p.constrain(this.x + this.vx, this.r + 100, MAP_W - this.r - 100);
    this.y = p.constrain(this.y + this.vy, this.r + 100, MAP_H - this.r - 100);
  }

  repel(mover) {
    let dx = mover.x - this.x, dy = mover.y - this.y;
    let d  = Math.sqrt(dx * dx + dy * dy);
    let minDist = (mover.size || mover.r) + this.r + 20;
    if (d < minDist && d > 0) {
      let f = (minDist - d) / minDist;
      mover.vx += (dx / d) * f * 3; mover.vy += (dy / d) * f * 3;
    }
  }

  draw(p) {
    p.noStroke(); p.fill(180, 40, 40);
    p.ellipse(this.x, this.y, this.r * 2);
    p.noFill(); p.stroke(220, 80, 80); p.strokeWeight(1.5);
    p.ellipse(this.x, this.y, this.r * 2);
  }
}

//Boid

class Boid {
  constructor(p, x, y, allBoids) {
    this.x = x; this.y = y;
    this.size = 7; this.speed = 5;
    this.alive = true;
    this.wanderOffset = p.random(1000);
    let nearest = null, nearestDist = Infinity;
    for (let b of allBoids) {
      if (!b.alive) continue;
      let dx = b.x - this.x, dy = b.y - this.y;
      let d = Math.sqrt(dx * dx + dy * dy);
      if (d < nearestDist && d > 0) { nearestDist = d; nearest = b; }
    }
    if (nearest) {
      let dx = nearest.x - this.x, dy = nearest.y - this.y;
      let d = Math.sqrt(dx * dx + dy * dy), spd = p.random(2, 3);
      this.vx = (dx / d) * spd; this.vy = (dy / d) * spd;
    } else {
      let ang = p.random(p.TWO_PI), spd = p.random(2, 3);
      this.vx = Math.cos(ang) * spd; this.vy = Math.sin(ang) * spd;
    }
  }

  update(p, others, player, squares, bigSquares, obstacles) {
    let pdx = player.x - this.x, pdy = player.y - this.y;
    let playerDistance = Math.sqrt(pdx * pdx + pdy * pdy);
    let fleeingPlayer = playerDistance < 400;
    if (fleeingPlayer) {
      this.vx += -(pdx / playerDistance) * 0.9;
      this.vy += -(pdy / playerDistance) * 0.9;
    }
    if (!fleeingPlayer) {
      for (let s of [...squares, ...bigSquares]) {
        if (!s.alive) continue;
        let dx = this.x - s.x, dy = this.y - s.y;
        let d = Math.sqrt(dx * dx + dy * dy);
        if (d < 150 && d > 0) { this.vx += (dx / d) * 1.5; this.vy += (dy / d) * 1.5; }
      }
    }
    for (let o of obstacles) o.repel(this);

    let sx = 0, sy = 0, scnt = 0;
    let ax = 0, ay = 0, acnt = 0;
    let cX = 0, cY = 0, ccnt = 0;
    for (let o of others) {
      if (o === this) continue;
      let odx = this.x - o.x, ody = this.y - o.y;
      let od = Math.sqrt(odx * odx + ody * ody);
      if (od < 50 && od > 0) { let f = (80 - od) / 50; sx += (odx / od) * f; sy += (ody / od) * f; scnt++; }
      if (od < 100) { ax += o.vx; ay += o.vy; acnt++; }
      if (od < 75)  { cX += o.x; cY += o.y; ccnt++; }
    }
    if (scnt > 0) { this.vx += (sx / scnt) * 0.5; this.vy += (sy / scnt) * 0.5; }
    if (acnt > 0) { this.vx += (ax / acnt) * 0.06; this.vy += (ay / acnt) * 0.06; }
    if (ccnt > 0) { this.vx += (cX / ccnt - this.x) * 0.005; this.vy += (cY / ccnt - this.y) * 0.005; }

    if (scnt === 0 && acnt === 0 && ccnt === 0) {
      let spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      if (spd > 0.1) { this.vx += (this.vx / spd) * 0.3; this.vy += (this.vy / spd) * 0.3; }
      this.vx += p.random(-0.03, 0.03); this.vy += p.random(-0.03, 0.03);
    } else {
      this.vx += p.random(-0.05, 0.05); this.vy += p.random(-0.05, 0.05);
    }

    let M = 200, BF = 16;
    if (this.x < M)         this.vx += BF / Math.max(this.x, 1);
    if (this.x > MAP_W - M) this.vx -= BF / Math.max(MAP_W - this.x, 1);
    if (this.y < M)         this.vy += BF / Math.max(this.y, 1);
    if (this.y > MAP_H - M) this.vy -= BF / Math.max(MAP_H - this.y, 1);

    let spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (spd > this.speed) { this.vx = this.vx / spd * this.speed; this.vy = this.vy / spd * this.speed; }
    this.vx *= 0.94; this.vy *= 0.94;
    this.x = p.constrain(this.x + this.vx, this.size, MAP_W - this.size);
    this.y = p.constrain(this.y + this.vy, this.size, MAP_H - this.size);
  }

  checkEat(player) {
    let dx = player.x - this.x, dy = player.y - this.y;
    if (Math.sqrt(dx * dx + dy * dy) < player.size + this.size) { this.alive = false; return true; }
    return false;
  }

  draw(p) {
    p.push(); p.translate(this.x, this.y);
    p.rotate(Math.atan2(this.vy, this.vx));
    p.fill(255); p.noStroke();
    p.triangle(this.size * 1.1, 0, -this.size * 0.8, -this.size * 0.65, -this.size * 0.8, this.size * 0.65);
    p.pop();
  }
}

//SquareBase

class SquareBase {
  constructor(p, x, y, size, speed) {
    this.x = x; this.y = y;
    this.vx = p.random(-1, 1); this.vy = p.random(-1, 1);
    this.angle = p.random(p.TWO_PI);
    this.size = size; this.speed = speed;
    this.alive = true;
  }

  baseUpdate(p, selfArr, boids, player, gameState, minLevel, obstacles, useBoundary) {
    let pdx = player.x - this.x, pdy = player.y - this.y;
    let pd  = Math.sqrt(pdx * pdx + pdy * pdy);
    let playerNearby = gameState.level >= minLevel && pd < 250;

    if (playerNearby) {
      this.vx -= (pdx / pd) * 2.0;
      this.vy -= (pdy / pd) * 2.0;
    } else {
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
        let force = p.map(nearestDist, 0, 300, 0.2, 0.6);
        this.vx += (dx / d) * force; this.vy += (dy / d) * force;
      } else {
        this.vx += p.random(-0.5, 0.5); this.vy += p.random(-0.5, 0.5);
      }
    }

    // Separation from same type
    for (let o of selfArr) {
      if (o === this || !o.alive) continue;
      let dx = this.x - o.x, dy = this.y - o.y;
      let d  = Math.sqrt(dx * dx + dy * dy);
      let minDist = (this.size + o.size) * 2.5;
      if (d < minDist && d > 0) {
        let f = (minDist - d) / minDist;
        this.vx += (dx / d) * f * 2.5; this.vy += (dy / d) * f * 2.5;
      }
    }

    for (let o of obstacles) o.repel(this);

    if (useBoundary) {
      let M = 200, BF = 8;
      if (this.x < M)         this.vx += BF / Math.max(this.x, 1);
      if (this.x > MAP_W - M) this.vx -= BF / Math.max(MAP_W - this.x, 1);
      if (this.y < M)         this.vy += BF / Math.max(this.y, 1);
      if (this.y > MAP_H - M) this.vy -= BF / Math.max(MAP_H - this.y, 1);
    }

    let spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (spd > this.speed) { this.vx = this.vx / spd * this.speed; this.vy = this.vy / spd * this.speed; }
    this.vx *= 0.96; this.vy *= 0.96;

    if (spd > 0.2) {
      let target = Math.atan2(this.vy, this.vx), da = target - this.angle;
      while (da >  Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      this.angle += da * 0.1;
    }

    this.x = p.constrain(this.x + this.vx, this.size * 2, MAP_W - this.size * 2);
    this.y = p.constrain(this.y + this.vy, this.size * 2, MAP_H - this.size * 2);

    for (let b of boids) {
      if (!b.alive) continue;
      let dx = b.x - this.x, dy = b.y - this.y;
      if (Math.sqrt(dx * dx + dy * dy) < this.size + b.size) b.alive = false;
    }
  }
}

//Small Square
class Square extends SquareBase {
  constructor(p, x, y) { super(p, x, y, 10, 8); }

  update(p, squares, boids, player, gameState, obstacles) {
    this.baseUpdate(p, squares, boids, player, gameState, 5, obstacles, true);
  }

  checkEat(player, gameState) {
    if (gameState.level < 5) return false;
    let dx = player.x - this.x, dy = player.y - this.y;
    if (Math.sqrt(dx * dx + dy * dy) < player.size + this.size) { this.alive = false; return true; }
    return false;
  }

  draw(p, gameState) {
    p.push(); p.translate(this.x, this.y); p.rotate(this.angle);
    p.rectMode(p.CENTER);
    p.fill(gameState.level < 5 ? p.color(239, 159, 39) : p.color(255));
    p.stroke(0, 0, 0, 50); p.strokeWeight(1);
    p.rect(0, 0, this.size * 4, this.size * 2);
    p.stroke(0, 0, 0, 80); p.line(0, 0, this.size * 2, 0);
    p.rectMode(p.CORNER); p.pop();
  }
}

//Big Square

class BigSquare extends SquareBase {
  constructor(p, x, y) { super(p, x, y, 24, 10); this.invincible = 0; }

  update(p, bigSquares, squares, boids, player, gameState, obstacles) {
    // No boundary repulsion, no obstacle repulsion — uses center pull instead
    this.baseUpdate(p, bigSquares, boids, player, gameState, 10, [], false);

    // Soft pull toward map center — prevents corner trapping
    let cx = MAP_W / 2, cy = MAP_H / 2;
    let cdx = cx - this.x, cdy = cy - this.y;
    let cd  = Math.sqrt(cdx * cdx + cdy * cdy);
    if (cd > 200) { this.vx += (cdx / cd) * 0.1; this.vy += (cdy / cd) * 0.1; }

    // Chase player if below level 10
    let pdx = player.x - this.x, pdy = player.y - this.y;
    let pd  = Math.sqrt(pdx * pdx + pdy * pdy);
    if (gameState.level < 10) {
      if (pd < 500 && pd > 0) { this.vx += (pdx / pd) * 0.6; this.vy += (pdy / pd) * 0.6; }
      if (this.invincible > 0) this.invincible--;
      if (pd < player.size + this.size) {
        let nx = pdx / pd, ny = pdy / pd;
        player.takeDamage(gameState, 50, nx * 10, ny * 10);
      }
    }

    // Eat small squares on contact
    for (let s of squares) {
      if (!s.alive) continue;
      let dx = s.x - this.x, dy = s.y - this.y;
      if (Math.sqrt(dx * dx + dy * dy) < this.size + s.size) {
        s.alive = false;
      }
    }

    // Loose position clamp — allow slight map overshoot
    this.x = p.constrain(this.x, -this.size, MAP_W + this.size);
    this.y = p.constrain(this.y, -this.size, MAP_H + this.size);
  }

  checkEat(player, gameState) {
    if (gameState.level < 10) return false;
    let dx = player.x - this.x, dy = player.y - this.y;
    if (Math.sqrt(dx * dx + dy * dy) < player.size + this.size) { this.alive = false; return true; }
    return false;
  }

  draw(p, gameState) {
    p.push(); p.translate(this.x, this.y); p.rotate(this.angle);
    p.rectMode(p.CENTER);
    p.fill(gameState.level < 10 ? p.color(226, 75, 74) : p.color(255));
    p.stroke(0, 0, 0, 50); p.strokeWeight(1);
    p.rect(0, 0, this.size * 4, this.size * 2);
    p.stroke(0, 0, 0, 80); p.line(0, 0, this.size * 2, 0);
    p.rectMode(p.CORNER); p.pop();
  }
}

//Minimap

class miniMap {
  constructor() { this.w = 200; this.h = 200; this.pad = 16; }

  draw(p, player, cam, boids, squares, bigSquares, obstacles) {
    let sx = this.w / MAP_W, sy = this.h / MAP_H;
    p.fill(12, 12, 22, 160); p.stroke(55, 55, 85); p.strokeWeight(1);
    p.rect(this.pad, this.pad, this.w, this.h, 4);
    p.noStroke();
    p.fill(255, 255, 255, 150);
    for (let b of boids) { if (!b.alive) continue; p.ellipse(this.pad + b.x * sx, this.pad + b.y * sy, 2.5, 2.5); }
    p.fill(239, 159, 39, 150);
    for (let s of squares) { if (!s.alive) continue; p.rect(this.pad + s.x * sx - 1.5, this.pad + s.y * sy - 1.5, 3, 3); }
    p.fill(226, 75, 74, 180);
    for (let s of bigSquares) { if (!s.alive) continue; p.rect(this.pad + s.x * sx - 2, this.pad + s.y * sy - 2, 4, 4); }
    p.fill(180, 40, 40, 200);
    for (let o of obstacles) { p.ellipse(this.pad + o.x * sx, this.pad + o.y * sy, 4, 4); }
    p.noFill(); p.stroke(100, 180, 255, 150);
    p.rect(this.pad + cam.x * sx, this.pad + cam.y * sy, p.width * sx, p.height * sy, 2);
    p.noStroke(); p.fill(100, 180, 255);
    p.ellipse(this.pad + player.x * sx, this.pad + player.y * sy, 5, 5);
  }
}

//Upgrade system

const UPGRADES = [
  { id: 'swift', name: 'Swift', tiers: [
    { rarity: 'common', val: 0.5,  label: '+0.5 speed' },
    { rarity: 'rare',   val: 1.0,  label: '+1.0 speed' },
    { rarity: 'legend', val: 1.5,  label: '+1.5 speed' },
  ]},
  { id: 'bulk', name: 'Bulk', tiers: [
    { rarity: 'common', val: { size: 3, hp: 20 }, label: '+3 size, +20 HP' },
    { rarity: 'rare',   val: { size: 5, hp: 40 }, label: '+5 size, +40 HP' },
    { rarity: 'legend', val: { size: 8, hp: 80 }, label: '+8 size, +80 HP' },
  ]},
  { id: 'glutton', name: 'Glutton', tiers: [
    { rarity: 'common', val: 1.3, label: 'x1.3 XP' },
    { rarity: 'rare',   val: 1.6, label: 'x1.6 XP' },
    { rarity: 'legend', val: 2.0, label: 'x2.0 XP' },
  ]},
  { id: 'agility', name: 'Agility', tiers: [
    { rarity: 'common', val: 0.04, label: '+0.04 turn speed' },
    { rarity: 'rare',   val: 0.08, label: '+0.08 turn speed' },
    { rarity: 'legend', val: 0.14, label: '+0.14 turn speed' },
  ]},
  { id: 'cooldown', name: 'Cooldown', tiers: [
    { rarity: 'rare',   val: 60,  label: '-1s dash cooldown' },
    { rarity: 'legend', val: 120, label: '-2s dash cooldown' },
  ]},
  { id: 'charges', name: 'Charges', tiers: [
    { rarity: 'rare',   val: 1, label: '+1 dash charge' },
    { rarity: 'legend', val: 2, label: '+2 dash charges' },
  ]},
];

function pickRarity(hasCommon) {
  let r = Math.random() * 100;
  if (hasCommon) { if (r < 10) return 'legend'; if (r < 40) return 'rare'; return 'common'; }
  return r < 30 ? 'legend' : 'rare';
}

function generateCards() {
  let pool = [...UPGRADES], chosen = [];
  while (chosen.length < 3 && pool.length > 0) {
    let i = Math.floor(Math.random() * pool.length);
    chosen.push(pool.splice(i, 1)[0]);
  }
  return chosen.map(function(u) {
    let hasCommon = u.tiers.some(function(t) { return t.rarity === 'common'; });
    let rarity = pickRarity(hasCommon);
    let tier = u.tiers.find(function(t) { return t.rarity === rarity; });
    if (!tier) tier = u.tiers[u.tiers.length - 1];
    return { id: u.id, name: u.name, rarity: rarity, val: tier.val, label: tier.label };
  });
}

function applyUpgrade(card, player, gameState, xpMultRef) {
  if (card.id === 'swift')    player.speed += card.val;
  if (card.id === 'bulk') {
    player.size += card.val.size;
    gameState.maxHp += card.val.hp;
    gameState.hp = Math.min(gameState.hp + card.val.hp, gameState.maxHp);
  }
  if (card.id === 'glutton')  xpMultRef.val *= card.val;
  if (card.id === 'agility')  player.control += card.val;
  if (card.id === 'cooldown') player.dashCooldownMax = Math.max(30, player.dashCooldownMax - card.val);
  if (card.id === 'charges')  { player.dashChargesMax += card.val; player.dashCharges = player.dashChargesMax; }
}

function applyLevelUpBonus(player, gameState) {
  player.size    += 1;
  player.speed   += 0.2;
  player.control += 0.02;
  player.dashCooldownMax = Math.max(30, player.dashCooldownMax - 0);
  if (gameState.level % 5 === 0) { player.dashChargesMax++; player.dashCharges = player.dashChargesMax; }
}

function triggerUpgrade(player, gameState, xpMultRef) {
  let cards     = generateCards();
  let container = document.getElementById('upgrade-cards');
  container.innerHTML = '';
  cards.forEach(function(card) {
    let div = document.createElement('div');
    div.className = 'ucard ' + card.rarity;
    let rarityLabel = { common: 'Common', rare: 'Rare', legend: 'Legend' }[card.rarity];
    div.innerHTML =
      '<div class="rarity">' + rarityLabel + '</div>' +
      '<div class="name">' + card.name + '</div>' +
      '<div class="desc">' + card.label + '</div>';
    div.addEventListener('click', function() {
      applyUpgrade(card, player, gameState, xpMultRef);
      document.getElementById('upgrade-screen').style.display = 'none';
      screen = 'playing';
    });
    container.appendChild(div);
  });
  document.getElementById('upgrade-screen').style.display = 'flex';
  screen = 'upgrade';
}

//P5 sketch

new p5(function(p) {

  let xpMult = { val: 1 };

  function respawnPos() {
    let x, y, tries = 0;
    do {
      x = p.random(200, MAP_W - 200);
      y = p.random(200, MAP_H - 200);
      tries++;
    } while (p.dist(x, y, player.x, player.y) < 600 && tries < 30);
    return { x: x, y: y };
  }

  function initGame() {
    boids = []; squares = []; bigSquares = []; obstacles = [];
    player    = new Player(MAP_W / 2, MAP_H / 2);
    minimap   = new miniMap();
    gameState = new GameState();
    xpMult    = { val: 1 };

    for (let i = 0; i < 10; i++) {
      let x, y, tries = 0;
      do {
        x = p.random(200, MAP_W - 200);
        y = p.random(200, MAP_H - 200);
        tries++;
      } while (p.dist(x, y, MAP_W / 2, MAP_H / 2) < 600 && tries < 30);
      obstacles.push(new Obstacle(x, y, p.random(30, 55)));
    }
    for (let i = 0; i < boidAmount; i++) boids.push(new Boid(p, p.random(MAP_W), p.random(MAP_H), boids));
    for (let i = 0; i < 10; i++) squares.push(new Square(p, p.random(MAP_W), p.random(MAP_H)));
    for (let i = 0; i < 5; i++)  bigSquares.push(new BigSquare(p, p.random(MAP_W), p.random(MAP_H)));
  }

  p.setup = function() {
    let cnv = p.createCanvas(p.windowWidth, p.windowHeight);
    cnv.style('display', 'block');
    cnv.style('position', 'fixed');
    cnv.style('top', '0');
    cnv.style('left', '0');
    p.textFont('monospace');
  };

  p.windowResized = function() { p.resizeCanvas(p.windowWidth, p.windowHeight); };
  p.keyPressed    = function() { if (p.key === ' ' && screen === 'playing') player.dash(); };

  p.draw = function() {
    p.background(10, 10, 18);

    if (screen === 'start')    { drawStart(p); return; }
    if (screen === 'tutorial') { drawTutorial(p); return; }
    if (screen === 'dead')     { drawDead(p); return; }
    if (screen === 'win')      { drawWin(p); return; }
    if (screen === 'upgrade')  { return; }

    cam.x = p.constrain(player.x - p.width  / 2, 0, MAP_W - p.width);
    cam.y = p.constrain(player.y - p.height / 2, 0, MAP_H - p.height);

    p.push();
    p.translate(-cam.x, -cam.y);

    p.stroke(22, 22, 35); p.strokeWeight(1);
    for (let x = 0; x < MAP_W; x += 150) p.line(x, 0, x, MAP_H);
    for (let y = 0; y < MAP_H; y += 150) p.line(0, y, MAP_W, y);
    p.noFill(); p.stroke(60, 60, 90); p.strokeWeight(2);
    p.rect(0, 0, MAP_W, MAP_H);

    for (let o of obstacles) { o.update(p, obstacles); o.draw(p); }

    player.update(p, cam, mouseHeld, obstacles);
    player.draw(p);

    for (let b of boids) {
      if (!b.alive) continue;
      b.update(p, boids, player, squares, bigSquares, obstacles);
      if (b.checkEat(player)) {
        if (gameState.addScore(10, xpMult.val)) {
          applyLevelUpBonus(player, gameState);
          triggerUpgrade(player, gameState, xpMult);
        }
      }
      b.draw(p);
    }

    for (let s of squares) {
      if (!s.alive) continue;
      s.update(p, squares, boids, player, gameState, obstacles);
      if (s.checkEat(player, gameState)) {
        if (gameState.addScore(100, xpMult.val)) {
          applyLevelUpBonus(player, gameState);
          triggerUpgrade(player, gameState, xpMult);
        }
        let pos = respawnPos();
        squares.push(new Square(p, pos.x, pos.y));
      }
      s.draw(p, gameState);
    }

    for (let s of bigSquares) {
      if (!s.alive) continue;
      s.update(p, bigSquares, squares, boids, player, gameState, obstacles);
      if (s.checkEat(player, gameState)) {
        if (gameState.addScore(300, xpMult.val)) {
          applyLevelUpBonus(player, gameState);
          triggerUpgrade(player, gameState, xpMult);
        }
        let pos = respawnPos();
        bigSquares.push(new BigSquare(p, pos.x, pos.y));
      }
      s.draw(p, gameState);
    }

    // Respawn eaten small squares from bigSquare
    let targetSquares = 10;
    while (squares.filter(function(s) { return s.alive; }).length < targetSquares) {
      let pos = respawnPos();
      squares.push(new Square(p, pos.x, pos.y));
    }

    p.pop();

    player.drawDashHUD(p);
    minimap.draw(p, player, cam, boids, squares, bigSquares, obstacles);
    gameState.update();
    gameState.draw(p, minimap);

    if (gameState.hp <= 0)     { screen = 'dead'; return; }
    if (gameState.level >= 15) { screen = 'win';  return; }

    if (p.frameCount % 300 === 0) {
      let aliveBoids = boids.filter(function(b) { return b.alive; }).length;
      let toSpawn    = Math.floor((boidAmount - aliveBoids) * 0.5);
      for (let i = 0; i < toSpawn; i++) boids.push(new Boid(p, p.random(MAP_W), p.random(MAP_H), boids));
    }
  };

  //Screen drawers

  function drawStart(p) {
    p.textAlign(p.CENTER, p.CENTER);
    p.fill(100, 180, 255); p.textSize(42);
    p.text('PREDATOR PROTOCOL', p.width / 2, p.height / 2 - 120);
    p.fill(160); p.textSize(14);
    p.text('Evolve. Hunt. Dominate.', p.width / 2, p.height / 2 - 75);
    drawButton(p, p.width / 2 - 90, p.height / 2 - 10, 160, 44, 'START', function() { initGame(); screen = 'playing'; });
    drawButton(p, p.width / 2 - 90, p.height / 2 + 60, 160, 44, 'TUTORIAL', function() { screen = 'tutorial'; });
  }

  function drawTutorial(p) {
    let lx = p.width / 2 - 280, ly = 80, lh = 26;
    p.fill(100, 180, 255); p.textSize(22); p.textAlign(p.CENTER, p.TOP);
    p.text('TUTORIAL', p.width / 2, ly);
    ly += 50;
    p.textAlign(p.LEFT, p.TOP);
    let lines = [
      '── CONTROLS ──────────────────────────────────────',
      'Hold LEFT MOUSE    Move toward cursor',
      'SPACE              Dash forward  (charges recharge over time)',
      '',
      '── UI ────────────────────────────────────────────',
      'Bottom center      White bar = HP  |  Blue bar = XP',
      '                   Small boxes above XP = dash charges',
      'Top left           Minimap  (dots = creatures, blue box = your view)',
      'Below minimap      Score and current level',
      '',
      '── CREATURES ─────────────────────────────────────',
      'White triangles    Prey — always edible, 10 XP each',
      'Yellow rectangles  Hunters — edible at level 5+, 100 XP',
      'Red rectangles     Danger — chase and damage you until level 10',
      '                   Edible at level 10+, 300 XP',
      'Red circles        Obstacles — bounce and deal 30 damage on contact',
      '',
      '── WIN / LOSE ────────────────────────────────────',
      'Reach level 20 to win.',
      'HP drops to 0 = game over.',
      '',
      '── UPGRADES ──────────────────────────────────────',
      'Every level up pauses the game and offers 3 cards.',
      'Common / Rare / Legend rarity — higher rarity = stronger bonus.',
    ];
    for (let line of lines) {
      if (line.startsWith('──')) { p.fill(100, 180, 255); p.textSize(12); }
      else if (line === '') { ly += lh * 0.5; continue; }
      else { p.fill(200); p.textSize(13); }
      p.text(line, lx, ly);
      ly += lh;
    }
    drawButton(p, p.width / 2 - 80, p.height - 70, 160, 40, 'BACK', function() { screen = 'start'; });
  }

  function drawDead(p) {
    p.textAlign(p.CENTER, p.CENTER);
    p.fill(226, 75, 74); p.textSize(48);
    p.text('GAME OVER', p.width / 2, p.height / 2 - 80);
    p.fill(160); p.textSize(16);
    p.text('Score: ' + gameState.score + '   Level: ' + (gameState.level + 1), p.width / 2, p.height / 2 - 30);
    drawButton(p, p.width / 2 - 80, p.height / 2 + 20, 160, 44, 'RETRY', function() { initGame(); screen = 'playing'; });
    drawButton(p, p.width / 2 - 80, p.height / 2 + 80, 160, 44, 'MENU', function() { screen = 'start'; });
  }

  function drawWin(p) {
    p.textAlign(p.CENTER, p.CENTER);
    p.fill(100, 220, 150); p.textSize(48);
    p.text('YOU WIN', p.width / 2, p.height / 2 - 80);
    p.fill(160); p.textSize(16);
    p.text('Score: ' + gameState.score, p.width / 2, p.height / 2 - 30);
    drawButton(p, p.width / 2 - 80, p.height / 2 + 20, 160, 44, 'PLAY AGAIN', function() { initGame(); screen = 'playing'; });
    drawButton(p, p.width / 2 - 80, p.height / 2 + 80, 160, 44, 'MENU', function() { screen = 'start'; });
  }

  function drawButton(p, x, y, w, h, label, onClick) {
    let hovered = p.mouseX >= x && p.mouseX <= x + w && p.mouseY >= y && p.mouseY <= y + h;
    p.fill(hovered ? p.color(40, 60, 90) : p.color(20, 25, 40));
    p.stroke(100, 180, 255, hovered ? 255 : 120); p.strokeWeight(1);
    p.rect(x, y, w, h, 6);
    p.noStroke(); p.fill(hovered ? p.color(200, 230, 255) : p.color(160, 200, 240));
    p.textSize(13); p.textAlign(p.CENTER, p.CENTER);
    p.text(label, x + w / 2, y + h / 2);
    if (!p._btnListeners) p._btnListeners = [];
    p._btnListeners.push({ x, y, w, h, onClick });
  }

  p.mousePressed = function() {
    if (p.mouseButton === p.LEFT) mouseHeld = true;
    if (p._btnListeners) {
      for (let btn of p._btnListeners) {
        if (p.mouseX >= btn.x && p.mouseX <= btn.x + btn.w &&
            p.mouseY >= btn.y && p.mouseY <= btn.y + btn.h) {
          btn.onClick();
        }
      }
      p._btnListeners = [];
    }
  };

  p.mouseReleased = function() { if (p.mouseButton === p.LEFT) mouseHeld = false; };

});
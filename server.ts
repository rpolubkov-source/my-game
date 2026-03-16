import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import path from 'path';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

const PORT = 3000;

// Game Logic
export type HeroType = 'Gunslinger' | 'Sniper' | 'Bomber';

interface Player {
  id: string;
  socket: any;
  hero: HeroType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  ultCharge: number;
  aimX: number;
  aimY: number;
  inputs: { up: boolean, down: boolean, left: boolean, right: boolean, lmb: boolean, rmb: boolean };
  lastShoot: number;
}

interface Projectile {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  life: number;
  isUlt: boolean;
}

const rooms = new Map<string, GameRoom>();
let waitingPlayer: { socket: any, hero: HeroType } | null = null;

class GameRoom {
  id: string;
  io: Server;
  players: Record<string, Player> = {};
  projectiles: Projectile[] = [];
  status: 'playing' | 'finished' = 'playing';
  loopInterval: any;

  constructor(id: string, io: Server) {
    this.id = id;
    this.io = io;
  }

  addPlayer(socket: any, hero: HeroType) {
    socket.join(this.id);
    const isFirst = Object.keys(this.players).length === 0;
    
    const maxHp = hero === 'Sniper' ? 80 : hero === 'Bomber' ? 120 : 100;
    
    this.players[socket.id] = {
      id: socket.id,
      socket,
      hero,
      x: isFirst ? 100 : 700,
      y: 300,
      hp: maxHp,
      maxHp,
      ultCharge: 0,
      aimX: 0,
      aimY: 0,
      inputs: { up: false, down: false, left: false, right: false, lmb: false, rmb: false },
      lastShoot: 0,
    };

    socket.on('input', (inputs: any) => {
      if (this.players[socket.id]) {
        this.players[socket.id].inputs = inputs;
      }
    });

    socket.on('aim', (aim: {x: number, y: number}) => {
      if (this.players[socket.id]) {
        this.players[socket.id].aimX = aim.x;
        this.players[socket.id].aimY = aim.y;
      }
    });

    socket.on('disconnect', () => {
      if (this.status === 'playing') {
        this.status = 'finished';
        const winnerId = Object.keys(this.players).find(id => id !== socket.id);
        this.io.to(this.id).emit('gameOver', { winner: winnerId, reason: 'opponent_disconnected' });
        this.stop();
      }
    });
  }

  start() {
    this.io.to(this.id).emit('gameStart', { roomId: this.id });
    this.loopInterval = setInterval(() => this.update(), 1000 / 30);
  }

  stop() {
    clearInterval(this.loopInterval);
    rooms.delete(this.id);
  }

  update() {
    if (this.status !== 'playing') return;

    const now = Date.now();
    const dt = 1000 / 30;

    // Update players
    for (const id in this.players) {
      const p = this.players[id];
      const speed = p.hero === 'Sniper' ? 4 : p.hero === 'Bomber' ? 3 : 5;
      
      let dx = 0; let dy = 0;
      if (p.inputs.up) dy -= speed;
      if (p.inputs.down) dy += speed;
      if (p.inputs.left) dx -= speed;
      if (p.inputs.right) dx += speed;

      if (dx !== 0 && dy !== 0) {
        const length = Math.sqrt(dx * dx + dy * dy);
        dx = (dx / length) * speed;
        dy = (dy / length) * speed;
      }

      p.x += dx;
      p.y += dy;

      p.x = Math.max(20, Math.min(780, p.x));
      p.y = Math.max(20, Math.min(580, p.y));

      // Shooting
      const reloadTime = p.hero === 'Sniper' ? 1000 : p.hero === 'Bomber' ? 800 : 400;
      if (p.inputs.lmb && now - p.lastShoot > reloadTime) {
        p.lastShoot = now;
        this.spawnProjectile(p, false);
      }

      // Ult
      if (p.inputs.rmb && p.ultCharge >= 100) {
        p.ultCharge = 0;
        this.spawnProjectile(p, true);
      }
    }

    // Update projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.x += proj.vx;
      proj.y += proj.vy;
      proj.life -= dt;

      let hit = false;
      for (const id in this.players) {
        if (id !== proj.ownerId) {
          const p = this.players[id];
          const dist = Math.hypot(p.x - proj.x, p.y - proj.y);
          if (dist < 20 + proj.radius) {
            p.hp -= proj.damage;
            hit = true;
            
            if (this.players[proj.ownerId]) {
              this.players[proj.ownerId].ultCharge = Math.min(100, this.players[proj.ownerId].ultCharge + proj.damage);
            }
            
            if (p.hp <= 0) {
              this.status = 'finished';
              this.io.to(this.id).emit('gameOver', { winner: proj.ownerId, reason: 'kill' });
              this.stop();
              return;
            }
          }
        }
      }

      if (hit || proj.life <= 0 || proj.x < 0 || proj.x > 800 || proj.y < 0 || proj.y > 600) {
        this.projectiles.splice(i, 1);
      }
    }

    // Send state
    const state = {
      players: Object.values(this.players).map(p => ({
        id: p.id, x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp, hero: p.hero, ultCharge: p.ultCharge, aimX: p.aimX, aimY: p.aimY
      })),
      projectiles: this.projectiles.map(p => ({
        id: p.id, x: p.x, y: p.y, radius: p.radius, ownerId: p.ownerId, isUlt: p.isUlt
      }))
    };
    this.io.to(this.id).emit('state', state);
  }

  spawnProjectile(p: Player, isUlt: boolean) {
    const angle = Math.atan2(p.aimY - p.y, p.aimX - p.x);
    if (p.hero === 'Gunslinger') {
      if (isUlt) {
        for (let i = -2; i <= 2; i++) {
          const a = angle + i * 0.15;
          this.projectiles.push({
            id: Math.random().toString(), ownerId: p.id,
            x: p.x, y: p.y, vx: Math.cos(a) * 15, vy: Math.sin(a) * 15,
            radius: 5, damage: 15, life: 2000, isUlt
          });
        }
      } else {
        this.projectiles.push({
          id: Math.random().toString(), ownerId: p.id,
          x: p.x, y: p.y, vx: Math.cos(angle) * 15, vy: Math.sin(angle) * 15,
          radius: 5, damage: 10, life: 2000, isUlt
        });
      }
    } else if (p.hero === 'Sniper') {
      if (isUlt) {
        this.projectiles.push({
          id: Math.random().toString(), ownerId: p.id,
          x: p.x, y: p.y, vx: Math.cos(angle) * 35, vy: Math.sin(angle) * 35,
          radius: 8, damage: 50, life: 1000, isUlt
        });
      } else {
        this.projectiles.push({
          id: Math.random().toString(), ownerId: p.id,
          x: p.x, y: p.y, vx: Math.cos(angle) * 25, vy: Math.sin(angle) * 25,
          radius: 4, damage: 30, life: 2000, isUlt
        });
      }
    } else if (p.hero === 'Bomber') {
      if (isUlt) {
        this.projectiles.push({
          id: Math.random().toString(), ownerId: p.id,
          x: p.x, y: p.y, vx: Math.cos(angle) * 5, vy: Math.sin(angle) * 5,
          radius: 40, damage: 40, life: 3000, isUlt
        });
      } else {
        this.projectiles.push({
          id: Math.random().toString(), ownerId: p.id,
          x: p.x, y: p.y, vx: Math.cos(angle) * 8, vy: Math.sin(angle) * 8,
          radius: 15, damage: 20, life: 2000, isUlt
        });
      }
    }
  }
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('joinMatchmaking', (hero: HeroType) => {
    if (waitingPlayer && waitingPlayer.socket.id !== socket.id) {
      const roomId = `room_${Date.now()}`;
      const room = new GameRoom(roomId, io);
      room.addPlayer(waitingPlayer.socket, waitingPlayer.hero);
      room.addPlayer(socket, hero);
      rooms.set(roomId, room);
      waitingPlayer = null;
      room.start();
    } else {
      waitingPlayer = { socket, hero };
    }
  });

  socket.on('cancelMatchmaking', () => {
    if (waitingPlayer && waitingPlayer.socket.id === socket.id) {
      waitingPlayer = null;
    }
  });

  socket.on('disconnect', () => {
    if (waitingPlayer && waitingPlayer.socket.id === socket.id) {
      waitingPlayer = null;
    }
  });
});

async function startServer() {
  // Vite middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

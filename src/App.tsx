import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Coins, Crosshair, Package, Trophy, Users, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type HeroType = 'Gunslinger' | 'Sniper' | 'Bomber';

interface PlayerState {
  id: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  hero: HeroType;
  ultCharge: number;
  aimX: number;
  aimY: number;
}

interface ProjectileState {
  id: string;
  x: number;
  y: number;
  radius: number;
  ownerId: string;
  isUlt: boolean;
}

interface GameState {
  players: PlayerState[];
  projectiles: ProjectileState[];
}

const HERO_COLORS: Record<HeroType, string> = {
  Gunslinger: '#3b82f6', // blue
  Sniper: '#10b981', // green
  Bomber: '#ef4444', // red
};

export default function App() {
  const [screen, setScreen] = useState<'menu' | 'heroes' | 'shop' | 'matchmaking' | 'game' | 'gameover'>('menu');
  const [gold, setGold] = useState(0);
  const [unlockedHeroes, setUnlockedHeroes] = useState<HeroType[]>(['Gunslinger']);
  const [selectedHero, setSelectedHero] = useState<HeroType>('Gunslinger');
  
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [matchResult, setMatchResult] = useState<{winner: string, reason: string} | null>(null);

  // Load saved data
  useEffect(() => {
    const savedGold = localStorage.getItem('duelist_gold');
    if (savedGold) setGold(parseInt(savedGold));
    
    const savedHeroes = localStorage.getItem('duelist_heroes');
    if (savedHeroes) setUnlockedHeroes(JSON.parse(savedHeroes));
    
    const savedSelected = localStorage.getItem('duelist_selected');
    if (savedSelected) setSelectedHero(savedSelected as HeroType);
  }, []);

  // Save data
  useEffect(() => {
    localStorage.setItem('duelist_gold', gold.toString());
    localStorage.setItem('duelist_heroes', JSON.stringify(unlockedHeroes));
    localStorage.setItem('duelist_selected', selectedHero);
  }, [gold, unlockedHeroes, selectedHero]);

  // Socket setup
  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    newSocket.on('gameStart', () => {
      setScreen('game');
    });

    newSocket.on('state', (state: GameState) => {
      setGameState(state);
    });

    newSocket.on('gameOver', ({ winner, reason }) => {
      setMatchResult({ winner, reason });
      setScreen('gameover');
      
      // Award gold
      if (winner === newSocket.id) {
        setGold(g => g + 50);
      } else {
        setGold(g => g + 10);
      }
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const startMatchmaking = () => {
    if (socket) {
      socket.emit('joinMatchmaking', selectedHero);
      setScreen('matchmaking');
    }
  };

  const cancelMatchmaking = () => {
    if (socket) {
      socket.emit('cancelMatchmaking');
      setScreen('menu');
    }
  };

  const buyBox = () => {
    if (gold >= 100) {
      const lockedHeroes = (['Gunslinger', 'Sniper', 'Bomber'] as HeroType[]).filter(h => !unlockedHeroes.includes(h));
      if (lockedHeroes.length > 0) {
        setGold(g => g - 100);
        const randomHero = lockedHeroes[Math.floor(Math.random() * lockedHeroes.length)];
        setUnlockedHeroes(prev => [...prev, randomHero]);
        alert(`You unlocked ${randomHero}!`);
      } else {
        alert("You already have all heroes!");
      }
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-zinc-800 flex items-center justify-center overflow-hidden">
      <AnimatePresence mode="wait">
        {screen === 'menu' && (
          <motion.div key="menu" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="flex flex-col items-center gap-8 w-full max-w-md p-6">
            <div className="text-center space-y-2">
              <h1 className="text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-zinc-100 to-zinc-500">
                DUELIST
              </h1>
              <p className="text-zinc-400 font-medium tracking-wide">1v1 ARENA SHOOTER</p>
            </div>

            <div className="flex items-center gap-2 bg-zinc-900/50 px-4 py-2 rounded-full border border-zinc-800">
              <Coins className="w-5 h-5 text-yellow-500" />
              <span className="font-mono font-bold text-lg">{gold}</span>
            </div>

            <div className="flex flex-col w-full gap-3">
              <button onClick={startMatchmaking} className="group relative w-full flex items-center justify-center gap-3 bg-zinc-100 text-zinc-950 py-4 rounded-2xl font-bold text-xl hover:bg-white transition-all active:scale-[0.98]">
                <Crosshair className="w-6 h-6 group-hover:rotate-90 transition-transform duration-300" />
                PLAY NOW
              </button>
              
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setScreen('heroes')} className="flex flex-col items-center justify-center gap-2 bg-zinc-900 py-4 rounded-2xl font-semibold hover:bg-zinc-800 transition-colors border border-zinc-800/50 hover:border-zinc-700">
                  <Users className="w-6 h-6 text-blue-400" />
                  HEROES
                </button>
                <button onClick={() => setScreen('shop')} className="flex flex-col items-center justify-center gap-2 bg-zinc-900 py-4 rounded-2xl font-semibold hover:bg-zinc-800 transition-colors border border-zinc-800/50 hover:border-zinc-700">
                  <Package className="w-6 h-6 text-purple-400" />
                  SHOP
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {screen === 'matchmaking' && (
          <motion.div key="matchmaking" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }} className="flex flex-col items-center gap-6">
            <div className="relative">
              <div className="w-24 h-24 border-4 border-zinc-800 border-t-zinc-100 rounded-full animate-spin"></div>
              <Crosshair className="w-8 h-8 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-zinc-500" />
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold">Searching for opponent...</h2>
              <p className="text-zinc-500 mt-2">Playing as {selectedHero}</p>
            </div>
            <button onClick={cancelMatchmaking} className="mt-4 px-6 py-2 rounded-full border border-zinc-700 hover:bg-zinc-800 transition-colors font-medium">
              Cancel
            </button>
          </motion.div>
        )}

        {screen === 'heroes' && (
          <motion.div key="heroes" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full max-w-2xl p-6 flex flex-col h-[80vh]">
            <div className="flex items-center gap-4 mb-8">
              <button onClick={() => setScreen('menu')} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
                <ArrowLeft className="w-6 h-6" />
              </button>
              <h2 className="text-3xl font-bold">Select Hero</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
              {(['Gunslinger', 'Sniper', 'Bomber'] as HeroType[]).map(hero => {
                const isUnlocked = unlockedHeroes.includes(hero);
                const isSelected = selectedHero === hero;
                
                return (
                  <button 
                    key={hero}
                    disabled={!isUnlocked}
                    onClick={() => setSelectedHero(hero)}
                    className={`relative flex flex-col items-center p-6 rounded-3xl border-2 transition-all text-left ${
                      isSelected ? 'border-zinc-100 bg-zinc-900' : 
                      isUnlocked ? 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-800' : 
                      'border-zinc-900 bg-zinc-950 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="w-16 h-16 rounded-2xl mb-4 flex items-center justify-center" style={{ backgroundColor: isUnlocked ? HERO_COLORS[hero] : '#27272a' }}>
                      {isUnlocked ? <Users className="w-8 h-8 text-white" /> : <Package className="w-8 h-8 text-zinc-600" />}
                    </div>
                    <h3 className="text-xl font-bold w-full text-center mb-2">{hero}</h3>
                    {!isUnlocked && (
                      <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 rounded-3xl backdrop-blur-sm">
                        <span className="font-bold text-zinc-400 flex items-center gap-2">
                          <Package className="w-4 h-4" /> Locked
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}

        {screen === 'shop' && (
          <motion.div key="shop" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="w-full max-w-md p-6 flex flex-col items-center">
            <div className="flex items-center w-full gap-4 mb-8">
              <button onClick={() => setScreen('menu')} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
                <ArrowLeft className="w-6 h-6" />
              </button>
              <h2 className="text-3xl font-bold flex-1">Shop</h2>
              <div className="flex items-center gap-2 bg-zinc-900 px-3 py-1.5 rounded-full border border-zinc-800">
                <Coins className="w-4 h-4 text-yellow-500" />
                <span className="font-mono font-bold">{gold}</span>
              </div>
            </div>

            <div className="w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 flex flex-col items-center text-center gap-6">
              <div className="w-32 h-32 bg-gradient-to-br from-purple-500/20 to-blue-500/20 rounded-2xl border border-purple-500/30 flex items-center justify-center relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-t from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <Package className="w-16 h-16 text-purple-400 group-hover:scale-110 transition-transform duration-500" />
              </div>
              
              <div>
                <h3 className="text-2xl font-bold mb-2">Hero Box</h3>
                <p className="text-zinc-400 text-sm">Contains one random locked hero. Expand your roster!</p>
              </div>

              <button 
                onClick={buyBox}
                disabled={gold < 100 || unlockedHeroes.length === 3}
                className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white py-4 rounded-2xl font-bold text-lg transition-colors active:scale-[0.98]"
              >
                {unlockedHeroes.length === 3 ? 'ALL HEROES UNLOCKED' : (
                  <>
                    OPEN FOR 100 <Coins className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}

        {screen === 'game' && (
          <motion.div key="game" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full h-screen flex items-center justify-center bg-zinc-950">
            <GameCanvas socket={socket!} gameState={gameState} myId={socket?.id || ''} />
          </motion.div>
        )}

        {screen === 'gameover' && (
          <motion.div key="gameover" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-8 p-8 bg-zinc-900 border border-zinc-800 rounded-3xl max-w-sm w-full text-center">
            <div className="w-20 h-20 rounded-full flex items-center justify-center bg-zinc-800 mb-4">
              {matchResult?.winner === socket?.id ? (
                <Trophy className="w-10 h-10 text-yellow-500" />
              ) : (
                <Crosshair className="w-10 h-10 text-red-500" />
              )}
            </div>
            
            <div>
              <h2 className="text-4xl font-black mb-2">
                {matchResult?.winner === socket?.id ? 'VICTORY' : 'DEFEAT'}
              </h2>
              <p className="text-zinc-400">
                {matchResult?.reason === 'opponent_disconnected' ? 'Opponent fled the battle' : 'Match finished'}
              </p>
            </div>

            <div className="flex items-center gap-3 bg-zinc-950 px-6 py-3 rounded-2xl border border-zinc-800">
              <span className="text-zinc-400 font-medium">Reward:</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-bold text-xl text-yellow-500">
                  +{matchResult?.winner === socket?.id ? 50 : 10}
                </span>
                <Coins className="w-5 h-5 text-yellow-500" />
              </div>
            </div>

            <button onClick={() => setScreen('menu')} className="w-full bg-zinc-100 text-zinc-950 py-4 rounded-2xl font-bold text-lg hover:bg-white transition-colors">
              RETURN TO MENU
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function GameCanvas({ socket, gameState, myId }: { socket: Socket, gameState: GameState | null, myId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keys = useRef({ up: false, down: false, left: false, right: false, lmb: false, rmb: false });
  const mouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'w' || e.key === 'W') keys.current.up = true;
      if (e.key === 's' || e.key === 'S') keys.current.down = true;
      if (e.key === 'a' || e.key === 'A') keys.current.left = true;
      if (e.key === 'd' || e.key === 'D') keys.current.right = true;
      socket.emit('input', keys.current);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'w' || e.key === 'W') keys.current.up = false;
      if (e.key === 's' || e.key === 'S') keys.current.down = false;
      if (e.key === 'a' || e.key === 'A') keys.current.left = false;
      if (e.key === 'd' || e.key === 'D') keys.current.right = false;
      socket.emit('input', keys.current);
    };
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) keys.current.lmb = true;
      if (e.button === 2) keys.current.rmb = true;
      socket.emit('input', keys.current);
    };
    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) keys.current.lmb = false;
      if (e.button === 2) keys.current.rmb = false;
      socket.emit('input', keys.current);
    };
    const handleMouseMove = (e: MouseEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const scaleX = canvasRef.current.width / rect.width;
      const scaleY = canvasRef.current.height / rect.height;
      mouse.current.x = (e.clientX - rect.left) * scaleX;
      mouse.current.y = (e.clientY - rect.top) * scaleY;
      socket.emit('aim', { x: mouse.current.x, y: mouse.current.y });
    };
    const handleContextMenu = (e: Event) => e.preventDefault();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [socket]);

  useEffect(() => {
    if (!canvasRef.current || !gameState) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.fillStyle = '#09090b'; // zinc-950
    ctx.fillRect(0, 0, 800, 600);

    // Draw grid
    ctx.strokeStyle = '#27272a'; // zinc-800
    ctx.lineWidth = 1;
    for (let i = 0; i < 800; i += 40) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 600); ctx.stroke();
    }
    for (let i = 0; i < 600; i += 40) {
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(800, i); ctx.stroke();
    }

    // Draw projectiles
    gameState.projectiles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.isUlt ? '#a855f7' : '#e4e4e7'; // purple-500 for ult, zinc-200 for normal
      ctx.fill();
      if (p.isUlt) {
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#a855f7';
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    });

    // Draw players
    gameState.players.forEach(p => {
      const isMe = p.id === myId;
      const color = HERO_COLORS[p.hero];

      // Draw aim line
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.aimX, p.aimY);
      ctx.strokeStyle = isMe ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 0, 0, 0.2)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw body
      ctx.beginPath();
      ctx.arc(p.x, p.y, 20, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = isMe ? '#ffffff' : '#ef4444';
      ctx.stroke();

      // Draw HP bar
      const hpPercent = p.hp / p.maxHp;
      ctx.fillStyle = '#3f3f46'; // zinc-700
      ctx.fillRect(p.x - 25, p.y - 35, 50, 6);
      ctx.fillStyle = isMe ? '#10b981' : '#ef4444'; // emerald-500 / red-500
      ctx.fillRect(p.x - 25, p.y - 35, 50 * hpPercent, 6);

      // Draw Ult bar (only for me)
      if (isMe) {
        const ultPercent = p.ultCharge / 100;
        ctx.fillStyle = '#3f3f46';
        ctx.fillRect(p.x - 25, p.y - 25, 50, 4);
        ctx.fillStyle = ultPercent >= 1 ? '#a855f7' : '#3b82f6'; // purple-500 / blue-500
        ctx.fillRect(p.x - 25, p.y - 25, 50 * ultPercent, 4);
      }

      // Draw name/hero
      ctx.fillStyle = '#a1a1aa'; // zinc-400
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(isMe ? 'YOU' : 'ENEMY', p.x, p.y + 35);
    });

  }, [gameState, myId]);

  return (
    <div className="relative">
      <canvas 
        ref={canvasRef} 
        width={800} 
        height={600} 
        className="bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl cursor-crosshair"
      />
      
      {/* HUD overlay */}
      {gameState && (
        <div className="absolute top-4 left-4 right-4 flex justify-between pointer-events-none">
          {gameState.players.map(p => {
            const isMe = p.id === myId;
            return (
              <div key={p.id} className={`flex flex-col gap-2 ${isMe ? 'items-start' : 'items-end'}`}>
                <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 px-4 py-2 rounded-xl flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: HERO_COLORS[p.hero] }}></div>
                  <span className="font-bold text-lg">{p.hero}</span>
                </div>
                {isMe && p.ultCharge >= 100 && (
                  <div className="bg-purple-500/20 border border-purple-500/50 text-purple-300 px-3 py-1 rounded-lg text-sm font-bold animate-pulse">
                    ULT READY (RMB)
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
